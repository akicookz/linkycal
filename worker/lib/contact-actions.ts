import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import { ContactService } from "../services/contact-service";
import type { CreateContactInput } from "../services/contact-service";
import { normalizeEmail } from "../services/contact-service";
import { dispatchWorkflowTrigger } from "./workflow-dispatch";
import type { AppEnv } from "../types";
import {
  createWithResourceCapacity,
  type CapacityFailure,
} from "./resource-creation";
import { recordEntitlementOutcome } from "./metered-entitlements";

// ─── Contact creation + new_contact_created dispatch ─────────────────────────
// Called from HTTP/MCP request handlers (like booking-actions). It dedupes +
// creates a contact and, only when a brand-new contact is created, fires the
// `new_contact_created` workflow trigger. NEVER call this from workflow step
// execution — that would violate the no-workflow-loop contract.

export interface EnsureContactResult {
  contact: dbSchema.ContactRow | null;
  created: boolean;
  skippedReason: "plan_resource_limit_reached" | null;
}

export async function ensureContact(
  db: DrizzleD1Database<Record<string, unknown>>,
  env: AppEnv,
  projectId: string,
  input: CreateContactInput,
  source: string,
  options?: {
    preserveSource?: boolean;
    sourceType: string;
    sourceId: string;
  },
): Promise<EnsureContactResult> {
  const service = new ContactService(db);
  const duplicate = await service.findDuplicate(projectId, input);
  if (duplicate) {
    const updated = await service.update(duplicate.id, input);
    return {
      contact: updated ?? duplicate,
      created: false,
      skippedReason: null,
    };
  }

  const creation = await createWithResourceCapacity({
    db,
    projectId,
    key: "contacts",
    create: async (transaction) =>
      new ContactService(transaction).create(projectId, input),
  });
  if (!creation.ok) {
    if (!options?.preserveSource) {
      throw new Error(creation.body.error);
    }
    await recordEntitlementOutcome({
      db,
      projectId,
      sourceType: options.sourceType,
      sourceId: options.sourceId,
      entitlementKey: "contacts",
      channel: source,
    });
    return {
      contact: null,
      created: false,
      skippedReason: "plan_resource_limit_reached",
    };
  }

  const result: EnsureContactResult = {
    contact: creation.value,
    created: true,
    skippedReason: null,
  };

  if (result.contact) {
    await dispatchWorkflowTrigger(db, env, projectId, "new_contact_created", {
      projectId,
      contactId: result.contact.id,
      contactEmail: result.contact.email ?? undefined,
      contactName: result.contact.name,
      metadata: { source },
    });
  }

  return result;
}

export async function importContactsWithCapacity(
  db: DrizzleD1Database<Record<string, unknown>>,
  projectId: string,
  rows: CreateContactInput[],
): Promise<
  | { ok: true; created: number; skipped: number; contacts: dbSchema.ContactRow[] }
  | CapacityFailure
> {
  const service = new ContactService(db);
  const existing = await service.list(projectId);
  const knownEmails = new Set(
    existing
      .map((contact) => normalizeEmail(contact.email))
      .filter((email): email is string => email !== null),
  );
  const pendingEmails = new Set<string>();
  const pending: CreateContactInput[] = [];
  let skipped = 0;

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (
      email &&
      (knownEmails.has(email) || pendingEmails.has(email))
    ) {
      skipped += 1;
      continue;
    }
    if (email) pendingEmails.add(email);
    pending.push({ ...row, email });
  }

  if (pending.length === 0) {
    return { ok: true, created: 0, skipped, contacts: [] };
  }

  const creation = await createWithResourceCapacity({
    db,
    projectId,
    key: "contacts",
    amount: pending.length,
    actionLabel: "import these contacts",
    create: async (transaction) => {
      const transactionService = new ContactService(transaction);
      const contacts: dbSchema.ContactRow[] = [];
      for (const row of pending) {
        contacts.push(await transactionService.create(projectId, row));
      }
      return contacts;
    },
  });
  if (!creation.ok) return creation;
  return {
    ok: true,
    created: creation.value.length,
    skipped,
    contacts: creation.value,
  };
}
