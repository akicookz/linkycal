import { ContactService } from "../services/contact-service";
import {
  createContactViewSchema,
  updateContactViewSchema,
} from "../validation";
import type { ActionResult, ProjectActionDeps } from "./action-result";
import { actionCreated, actionError, actionNotFound, actionOk } from "./action-result";

function invalidRequest<T = never>(): ActionResult<T> {
  return actionError(400, "Invalid request");
}

export async function listContactViewsAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<unknown>> {
  return actionOk({ views: await new ContactService(deps.db).listViews(deps.projectId) });
}

export async function createContactViewAction(
  deps: ProjectActionDeps,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = createContactViewSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const view = await new ContactService(deps.db).createView(deps.projectId, parsed.data);
  return view ? actionCreated({ view }) : actionError(500, "Failed to create view");
}

export async function updateContactViewAction(
  deps: ProjectActionDeps,
  viewId: string,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = updateContactViewSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  const view = await new ContactService(deps.db).updateView(
    deps.projectId,
    viewId,
    parsed.data,
  );
  return view && view.projectId === deps.projectId
    ? actionOk({ view })
    : actionNotFound("View");
}

export async function deleteContactViewAction(
  deps: ProjectActionDeps,
  viewId: string,
): Promise<ActionResult<{ success: true }>> {
  const service = new ContactService(deps.db);
  const existing = await service.getView(viewId);
  if (!existing || existing.projectId !== deps.projectId) return actionNotFound("View");
  await service.deleteView(deps.projectId, viewId);
  return actionOk({ success: true });
}

export async function seedContactPipelineAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<unknown>> {
  return actionCreated(await new ContactService(deps.db).seedPipeline(deps.projectId));
}
