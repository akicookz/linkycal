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
import { reserveProjectUsage } from "./metered-entitlements";
import { WorkflowExecutionService } from "../services/workflow-execution-service";
import { EntitlementService } from "../services/entitlement-service";
import {
  createContactSchema,
  importContactsSchema,
  listContactsQuerySchema,
  setNextActionSchema,
  setStageSchema,
  updateContactSchema,
} from "../validation";
import type { ProjectActionDeps, ActionResult } from "./action-result";
import { actionCreated, actionError, actionNotFound, actionOk } from "./action-result";
import { ContactActivityService, parseContactActivityListOptions } from "../services/contact-activity-service";

type ContactActionDeps = ProjectActionDeps;

function invalidRequest<T = never>(): ActionResult<T> {
  return actionError(400, "Invalid request");
}

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
    env,
    channel: source,
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
  env?: AppEnv,
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
    env,
    channel: "contact_import",
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

// ─── Project-scoped contact actions ─────────────────────────────────────────

export async function listContactsAction(
  deps: ContactActionDeps,
  rawQuery: unknown,
): Promise<ActionResult<{ contacts: unknown[]; total: number }>> {
  const parsed = listContactsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return invalidRequest();
  const { limit, offset, ...options } = parsed.data;
  const page = await new ContactService(deps.db).listPage(
    deps.projectId,
    options,
    { limit, offset },
  );
  return actionOk(page);
}

export async function getContactAction(
  deps: ContactActionDeps,
  contactId: string,
): Promise<ActionResult<{ contact: unknown }>> {
  const contact = await new ContactService(deps.db).getWithDetails(
    contactId,
    deps.projectId,
  );
  return contact ? actionOk({ contact }) : actionNotFound("Contact");
}

export async function createContactAction(
  deps: ContactActionDeps,
  body: unknown,
): Promise<ActionResult<{ contact: dbSchema.ContactRow; created: boolean }>> {
  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const service = new ContactService(deps.db);
  const duplicate = await service.findDuplicate(deps.projectId, parsed.data);
  if (duplicate) {
    return actionOk({ contact: duplicate, created: false });
  }
  const creation = await createWithResourceCapacity({
    db: deps.db,
    projectId: deps.projectId,
    key: "contacts",
    env: deps.env,
    channel: deps.channel,
    create: async function createContact(transaction) {
      return new ContactService(transaction).create(deps.projectId, parsed.data);
    },
  });
  if (!creation.ok) {
    return actionError(creation.status, creation.body.error, {
      code: creation.body.code,
      details: creation.body as unknown as Record<string, unknown>,
    });
  }
  await dispatchWorkflowTrigger(
    deps.db,
    deps.env,
    deps.projectId,
    "new_contact_created",
    {
      projectId: deps.projectId,
      contactId: creation.value.id,
      contactEmail: creation.value.email ?? undefined,
      contactName: creation.value.name,
      metadata: { source: deps.channel === "rest" ? "manual" : "mcp" },
    },
  );
  return actionCreated({ contact: creation.value, created: true });
}

export async function updateContactAction(
  deps: ContactActionDeps,
  contactId: string,
  body: unknown,
): Promise<ActionResult<{ contact: dbSchema.ContactRow }>> {
  const parsed = updateContactSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const service = new ContactService(deps.db);
  if (!(await service.contactInProject(deps.projectId, contactId))) {
    return actionNotFound("Contact");
  }
  const contact = await service.update(contactId, parsed.data);
  return contact ? actionOk({ contact }) : actionNotFound("Contact");
}

export async function deleteContactAction(
  deps: ContactActionDeps,
  contactId: string,
): Promise<ActionResult<{ success: true }>> {
  const service = new ContactService(deps.db);
  if (!(await service.contactInProject(deps.projectId, contactId))) {
    return actionNotFound("Contact");
  }
  await service.delete(contactId);
  return actionOk({ success: true });
}

export async function setContactNextActionAction(
  deps: ContactActionDeps,
  contactId: string,
  body: unknown,
): Promise<ActionResult<{ contact: dbSchema.ContactRow | null }>> {
  const parsed = setNextActionSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const service = new ContactService(deps.db);
  if (!(await service.contactInProject(deps.projectId, contactId))) {
    return actionNotFound("Contact");
  }
  const contact = await service.setNextAction(
    contactId,
    parsed.data.text === null
      ? null
      : {
          text: parsed.data.text,
          deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
        },
  );
  return actionOk({ contact });
}

export async function getContactActivityAction(
  deps: ContactActionDeps,
  contactId: string,
  query: { category?: string; limit?: string | number; cursor?: string },
): Promise<ActionResult<unknown>> {
  let options;
  try {
    options = parseContactActivityListOptions({
      category: query.category,
      limit: query.limit === undefined ? undefined : String(query.limit),
      cursor: query.cursor,
    });
  } catch (error) {
    return actionError(400, error instanceof Error ? error.message : "Invalid request");
  }
  const page = await new ContactActivityService(deps.db).list(
    deps.projectId,
    contactId,
    options,
  );
  return page ? actionOk(page) : actionNotFound("Contact");
}

export async function setContactStageAction(
  deps: ContactActionDeps,
  contactId: string,
  body: unknown,
): Promise<ActionResult<{ success: true }>> {
  const parsed = setStageSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const service = new ContactService(deps.db);
  if (!(await service.contactInProject(deps.projectId, contactId))) {
    return actionNotFound("Contact");
  }
  const status = await service.setStage(deps.projectId, contactId, parsed.data.tagId);
  return status === "invalid_stage"
    ? actionError(400, "Invalid pipeline stage")
    : actionOk({ success: true });
}

export async function enrichContactAction(
  deps: ContactActionDeps,
  contactId: string,
): Promise<ActionResult<{ success: true; contact: dbSchema.ContactRow | null }>> {
  const service = new ContactService(deps.db);
  if (!(await service.contactInProject(deps.projectId, contactId))) {
    return actionNotFound("Contact");
  }
  const reservation = await reserveProjectUsage({
    db: deps.db,
    projectId: deps.projectId,
    key: "enrichments",
    operationId: crypto.randomUUID(),
    channel: "contact_enrichment",
    env: deps.env,
  });
  if (!reservation.decision.allowed) {
    const failure = reservation.httpError("enrich this contact");
    return actionError(failure.status, failure.body.error, {
      code: failure.body.code,
      details: failure.body as unknown as Record<string, unknown>,
      headers: failure.headers,
    });
  }
  try {
    await new WorkflowExecutionService(deps.db).enrichContact(
      deps.projectId,
      contactId,
      deps.env,
    );
    await reservation.consume();
  } catch (error) {
    await reservation.release();
    if (error instanceof Error && error.name.startsWith("AI_")) {
      return actionError(502, "Enrichment provider unavailable. Please try again later.");
    }
    throw error;
  }
  return actionOk({ success: true, contact: await service.getById(contactId) });
}

interface ContactImportError {
  row: number;
  reason: string;
}

function importCell(row: Record<string, string>, column: string | undefined): string {
  return column ? (row[column] ?? "").trim() : "";
}

function importText(value: string, maxLength: number): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function addImportError(errors: ContactImportError[], row: number, reason: string): void {
  if (errors.length < 20) errors.push({ row, reason });
}

export async function importContactsAction(
  deps: ContactActionDeps,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = importContactsSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const errors: ContactImportError[] = [];
  const rows: CreateContactInput[] = [];
  let skipped = 0;
  let failed = 0;
  const existing = await new ContactService(deps.db).list(deps.projectId);
  const knownEmails = new Set(existing.map((contact) => normalizeEmail(contact.email)).filter(Boolean));
  const pendingEmails = new Set<string>();
  for (const [index, row] of parsed.data.rows.entries()) {
    const rowNumber = index + 2;
    const email = normalizeEmail(importCell(row, parsed.data.mapping.email));
    const name = importText(importCell(row, parsed.data.mapping.name), 200) ??
      (email ? email.split("@")[0]?.slice(0, 200) : undefined);
    const contact = {
      name,
      email,
      phone: importText(importCell(row, parsed.data.mapping.phone), 30),
      notes: importText(importCell(row, parsed.data.mapping.notes), 5000),
    };
    const valid = createContactSchema.safeParse(contact);
    if (!valid.success) {
      failed += 1;
      addImportError(errors, rowNumber, !name ? "Name or email is required" : email ? "Invalid email address" : "Invalid contact data");
      continue;
    }
    if (email && (knownEmails.has(email) || pendingEmails.has(email))) {
      skipped += 1;
      addImportError(errors, rowNumber, "Email already exists");
      continue;
    }
    if (email) pendingEmails.add(email);
    rows.push(valid.data);
  }
  const created = await importContactsWithCapacity(deps.db, deps.projectId, rows, deps.env);
  if (!created.ok) {
    return actionError(created.status, created.body.error, {
      code: created.body.code,
      details: created.body as unknown as Record<string, unknown>,
    });
  }
  const capacity = await new EntitlementService(deps.db).resource(deps.projectId, "contacts", 0);
  return actionOk({
    total: parsed.data.rows.length,
    imported: created.created,
    skipped: skipped + created.skipped,
    failed,
    remainingCapacity: capacity.limit === null ? null : Math.max(0, capacity.limit - (capacity.used ?? 0)),
    errors,
  });
}
