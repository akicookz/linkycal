import type { DrizzleD1Database } from "drizzle-orm/d1";
import { WorkflowExecutionService } from "../services/workflow-execution-service";
import type { TriggerContext } from "../services/workflow-execution-service";
import type { AppEnv } from "../types";

// ─── Workflow Trigger Dispatch ───────────────────────────────────────────────
// Called from HTTP request handlers via waitUntil(). The queue consumer NEVER
// calls this function — this is the loop prevention contract.

export async function dispatchWorkflowTrigger(
  db: DrizzleD1Database<Record<string, unknown>>,
  env: AppEnv,
  projectId: string,
  trigger: "form_submitted" | "booking_created" | "booking_cancelled" | "booking_pending" | "booking_confirmed" | "new_contact_created" | "tag_added",
  context: TriggerContext,
) {
  const executionService = new WorkflowExecutionService(db);
  await executionService.dispatchTrigger(projectId, trigger, context, env);
}
