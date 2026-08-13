import { and, desc, eq } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import { ContactService } from "../services/contact-service";
import { TagService } from "../services/tag-service";
import { WorkflowExecutionService } from "../services/workflow-execution-service";
import { WorkflowService } from "../services/workflow-service";
import type { TriggerContext } from "../services/workflow-execution-service";
import {
  createWorkflowSchema,
  createWorkflowStepSchema,
  reorderWorkflowStepsSchema,
  testWorkflowSchema,
  triggerWorkflowSchema,
  updateWorkflowSchema,
  updateWorkflowStepSchema,
} from "../validation";
import { createWithResourceCapacity } from "./resource-creation";
import { parseWorkflowTriggerConfig } from "./workflow-schedule";
import type { ActionResult, ProjectActionDeps } from "./action-result";
import { actionCreated, actionError, actionNotFound, actionOk } from "./action-result";

function invalidRequest<T = never>(): ActionResult<T> {
  return actionError(400, "Invalid request");
}

async function projectWorkflow(
  deps: ProjectActionDeps,
  workflowId: string,
) {
  const workflow = await new WorkflowService(deps.db).getById(workflowId);
  return workflow?.projectId === deps.projectId ? workflow : null;
}

function slugifyFormFieldKey(label: string | null | undefined): string {
  return (label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function listWorkflowsAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<unknown>> {
  return actionOk({ workflows: await new WorkflowService(deps.db).list(deps.projectId) });
}

export async function getWorkflowAction(
  deps: ProjectActionDeps,
  workflowId: string,
): Promise<ActionResult<unknown>> {
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  const workflow = await new WorkflowService(deps.db).getFullWorkflow(workflowId);
  return workflow ? actionOk({ workflow }) : actionNotFound("Workflow");
}

export async function createWorkflowAction(
  deps: ProjectActionDeps,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = createWorkflowSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const creation = await createWithResourceCapacity({
    db: deps.db,
    projectId: deps.projectId,
    key: "workflows",
    env: deps.env,
    channel: deps.channel,
    create: (db) => new WorkflowService(db).create(deps.projectId, parsed.data),
  });
  if (!creation.ok) return actionError(creation.status, creation.body.error, {
    code: creation.body.code,
    details: creation.body as unknown as Record<string, unknown>,
  });
  return actionCreated({ workflow: creation.value });
}

export async function updateWorkflowAction(
  deps: ProjectActionDeps,
  workflowId: string,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = updateWorkflowSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  const workflow = await new WorkflowService(deps.db).update(workflowId, parsed.data);
  return workflow ? actionOk({ workflow }) : actionNotFound("Workflow");
}

export async function deleteWorkflowAction(
  deps: ProjectActionDeps,
  workflowId: string,
): Promise<ActionResult<{ success: true }>> {
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  await new WorkflowService(deps.db).delete(workflowId);
  return actionOk({ success: true });
}

export async function createWorkflowStepAction(
  deps: ProjectActionDeps,
  workflowId: string,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = createWorkflowStepSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  return actionCreated({ step: await new WorkflowService(deps.db).createStep(workflowId, parsed.data) });
}

export async function listWorkflowStepsAction(
  deps: ProjectActionDeps,
  workflowId: string,
): Promise<ActionResult<unknown>> {
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  return actionOk({
    steps: await new WorkflowService(deps.db).listSteps(workflowId),
  });
}

export async function updateWorkflowStepAction(
  deps: ProjectActionDeps,
  workflowId: string,
  stepId: string,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = updateWorkflowStepSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const service = new WorkflowService(deps.db);
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  const step = await service.getStepById(stepId);
  if (!step || step.workflowId !== workflowId) return actionNotFound("Step");
  return actionOk({ step: await service.updateStep(stepId, parsed.data) });
}

export async function deleteWorkflowStepAction(
  deps: ProjectActionDeps,
  workflowId: string,
  stepId: string,
): Promise<ActionResult<{ success: true }>> {
  const service = new WorkflowService(deps.db);
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  const step = await service.getStepById(stepId);
  if (!step || step.workflowId !== workflowId) return actionNotFound("Step");
  await service.deleteStep(stepId);
  return actionOk({ success: true });
}

export async function reorderWorkflowStepsAction(
  deps: ProjectActionDeps,
  workflowId: string,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = reorderWorkflowStepsSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const service = new WorkflowService(deps.db);
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  const steps = await service.listSteps(workflowId);
  if (
    steps.length !== parsed.data.stepIds.length ||
    new Set(parsed.data.stepIds).size !== steps.length ||
    steps.some((step) => !parsed.data.stepIds.includes(step.id))
  ) return actionError(400, "stepIds must contain every workflow step exactly once");
  return actionOk({ steps: await service.reorderSteps(workflowId, parsed.data.stepIds) });
}

export async function listWorkflowRunsAction(
  deps: ProjectActionDeps,
  workflowId: string,
  limit?: number,
): Promise<ActionResult<unknown>> {
  if (!(await projectWorkflow(deps, workflowId))) return actionNotFound("Workflow");
  const bounded = limit === undefined ? undefined : Math.max(1, Math.min(100, limit));
  return actionOk({ runs: await new WorkflowService(deps.db).listRuns(workflowId, bounded) });
}

export async function getWorkflowRunAction(
  deps: ProjectActionDeps,
  workflowId: string,
  runId: string,
): Promise<ActionResult<unknown>> {
  const run = await new WorkflowService(deps.db).getRunInProject(
    deps.projectId,
    workflowId,
    runId,
  );
  return run ? actionOk({ run }) : actionNotFound("Workflow run");
}

export async function triggerWorkflowAction(
  deps: ProjectActionDeps,
  workflowId: string,
  body: unknown = {},
): Promise<ActionResult<unknown>> {
  const parsed = triggerWorkflowSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const workflow = await projectWorkflow(deps, workflowId);
  if (!workflow) return actionNotFound("Workflow");
  if (workflow.trigger !== "manual" && workflow.trigger !== "scheduled") {
    return actionError(400, "Only manual or scheduled workflows can be triggered via this endpoint");
  }
  if (workflow.status !== "active") return actionError(400, "Workflow must be active to trigger");
  const execution = new WorkflowExecutionService(deps.db);
  let started: number;
  if (parsed.data.contactId) {
    const contact = await new ContactService(deps.db).getByIdInProject(deps.projectId, parsed.data.contactId);
    if (!contact) return actionNotFound("Contact");
    const context: TriggerContext = {
      projectId: deps.projectId,
      contactId: contact.id,
      contactEmail: contact.email ?? undefined,
      contactName: contact.name ?? undefined,
    };
    started = (await execution.dispatchTestRun(workflowId, context, deps.env)) ? 1 : 0;
  } else {
    const config = parseWorkflowTriggerConfig(workflow.triggerConfig);
    started = await execution.dispatchToFilteredContacts(
      workflowId,
      deps.projectId,
      config?.contactFilter ?? null,
      deps.env,
    );
  }
  return started > 0
    ? actionCreated({ success: true, started })
    : actionError(400, "No runs started — the workflow has no steps or no contacts match the filter");
}

export async function testWorkflowAction(
  deps: ProjectActionDeps,
  workflowId: string,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = testWorkflowSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const workflow = await projectWorkflow(deps, workflowId);
  if (!workflow) return actionNotFound("Workflow");
  if (workflow.trigger === "tag_added" && !parsed.data.tagId) {
    return actionError(400, "tagId is required for tag_added workflows");
  }
  if (parsed.data.tagId && !(await new TagService(deps.db).get(deps.projectId, parsed.data.tagId))) {
    return actionNotFound("Tag");
  }
  const contact = await new ContactService(deps.db).getByIdInProject(deps.projectId, parsed.data.contactId);
  if (!contact) return actionNotFound("Contact");
  const context: TriggerContext = {
    projectId: deps.projectId,
    contactId: contact.id,
    contactEmail: contact.email ?? undefined,
    contactName: contact.name ?? undefined,
    tagId: parsed.data.tagId,
  };
  if (workflow.trigger === "form_submitted" && contact.email) {
    const [response] = await deps.db
      .select({ id: dbSchema.formResponses.id })
      .from(dbSchema.formResponses)
      .innerJoin(dbSchema.forms, eq(dbSchema.formResponses.formId, dbSchema.forms.id))
      .where(and(
        eq(dbSchema.forms.projectId, deps.projectId),
        eq(dbSchema.formResponses.respondentEmail, contact.email),
      ))
      .orderBy(desc(dbSchema.formResponses.createdAt))
      .limit(1);
    if (response) {
      context.formResponseId = response.id;
      const values = await deps.db
        .select({ fieldId: dbSchema.formFieldValues.fieldId, label: dbSchema.formFields.label, value: dbSchema.formFieldValues.value })
        .from(dbSchema.formFieldValues)
        .innerJoin(dbSchema.formFields, and(
          eq(dbSchema.formFieldValues.formId, dbSchema.formFields.formId),
          eq(dbSchema.formFieldValues.fieldId, dbSchema.formFields.id),
        ))
        .where(eq(dbSchema.formFieldValues.responseId, response.id));
      const formFields: Record<string, string> = {};
      for (const value of values) {
        if (!value.value) continue;
        formFields[value.fieldId] = value.value;
        const key = slugifyFormFieldKey(value.label);
        if (key && !(key in formFields)) formFields[key] = value.value;
      }
      context.metadata = { ...(context.metadata ?? {}), formFields };
    }
  }
  const runId = await new WorkflowExecutionService(deps.db).dispatchTestRun(workflowId, context, deps.env);
  return runId
    ? actionCreated({ success: true, runId })
    : actionError(400, "Workflow has no steps");
}
