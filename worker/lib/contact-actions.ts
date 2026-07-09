import type { DrizzleD1Database } from "drizzle-orm/d1";
import { ContactService } from "../services/contact-service";
import type { CreateContactInput } from "../services/contact-service";
import { dispatchWorkflowTrigger } from "./workflow-dispatch";
import type { AppEnv } from "../types";

// ─── Contact creation + new_contact_created dispatch ─────────────────────────
// Called from HTTP/MCP request handlers (like booking-actions). It dedupes +
// creates a contact and, only when a brand-new contact is created, fires the
// `new_contact_created` workflow trigger. NEVER call this from workflow step
// execution — that would violate the no-workflow-loop contract.

export type EnsureContactResult = Awaited<
  ReturnType<ContactService["findOrCreate"]>
>;

export async function ensureContact(
  db: DrizzleD1Database<Record<string, unknown>>,
  env: AppEnv,
  projectId: string,
  input: CreateContactInput,
  source: string,
): Promise<EnsureContactResult> {
  const service = new ContactService(db);
  const result = await service.findOrCreate(projectId, input);

  if (result.created) {
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
