import { TagNameConflictError, TagService } from "../services/tag-service";
import {
  createTagSchema,
  listTagsQuerySchema,
  updateTagSchema,
} from "../validation";
import { dispatchWorkflowTrigger } from "./workflow-dispatch";
import type { ActionResult, ProjectActionDeps } from "./action-result";
import { actionCreated, actionError, actionNotFound, actionOk } from "./action-result";

function invalidRequest<T = never>(): ActionResult<T> {
  return actionError(400, "Invalid request");
}

function tagConflict<T = never>(error: unknown): ActionResult<T> | null {
  return error instanceof TagNameConflictError
    ? actionError(409, error.message, { code: "TAG_NAME_CONFLICT" })
    : null;
}

export async function listTagsAction(
  deps: ProjectActionDeps,
  query: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = listTagsQuerySchema.safeParse(query);
  if (!parsed.success) return invalidRequest();
  try {
    return actionOk(await new TagService(deps.db).list(deps.projectId, parsed.data));
  } catch (error) {
    return error instanceof Error && error.message === "Invalid tag cursor"
      ? invalidRequest()
      : (() => { throw error; })();
  }
}

export async function listAllTagsAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<unknown>> {
  return actionOk(await new TagService(deps.db).listAll(deps.projectId));
}

export async function getTagAction(
  deps: ProjectActionDeps,
  tagId: string,
): Promise<ActionResult<unknown>> {
  const tag = await new TagService(deps.db).get(deps.projectId, tagId);
  return tag ? actionOk({ tag }) : actionNotFound("Tag");
}

export async function createTagAction(
  deps: ProjectActionDeps,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  try {
    return actionCreated({ tag: await new TagService(deps.db).create(deps.projectId, parsed.data) });
  } catch (error) {
    const conflict = tagConflict(error);
    if (conflict) return conflict;
    throw error;
  }
}

export async function updateTagAction(
  deps: ProjectActionDeps,
  tagId: string,
  body: unknown,
): Promise<ActionResult<unknown>> {
  const parsed = updateTagSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();
  try {
    const tag = await new TagService(deps.db).update(deps.projectId, tagId, parsed.data);
    return tag ? actionOk({ tag }) : actionNotFound("Tag");
  } catch (error) {
    const conflict = tagConflict(error);
    if (conflict) return conflict;
    throw error;
  }
}

export async function deleteTagAction(
  deps: ProjectActionDeps,
  tagId: string,
): Promise<ActionResult<unknown>> {
  const result = await new TagService(deps.db).delete(deps.projectId, tagId);
  if (result.status === "not_found") return actionNotFound("Tag");
  if (result.status === "in_use") {
    return actionError(409, "Tag is referenced by one or more workflows", {
      code: "TAG_IN_USE",
      details: { workflows: result.workflows },
    });
  }
  return actionOk({ success: true });
}

export async function addTagToContactAction(
  deps: ProjectActionDeps,
  contactId: string,
  tagId: string,
): Promise<ActionResult<unknown>> {
  if (!tagId.trim()) return invalidRequest();
  const result = await new TagService(deps.db).assignToContact(
    deps.projectId,
    contactId,
    tagId,
  );
  if (result.status === "contact_not_found") return actionNotFound("Contact");
  if (result.status === "tag_not_found") return actionNotFound("Tag");
  if (result.changed) {
    deps.waitUntil(dispatchWorkflowTrigger(
      deps.db,
      deps.env,
      deps.projectId,
      "tag_added",
      { projectId: deps.projectId, contactId, tagId },
    ));
  }
  return actionCreated({ success: true, tag: result.tag, assigned: result.changed });
}

export async function removeTagFromContactAction(
  deps: ProjectActionDeps,
  contactId: string,
  tagId: string,
): Promise<ActionResult<unknown>> {
  if (!tagId.trim()) return invalidRequest();
  const result = await new TagService(deps.db).removeFromContact(
    deps.projectId,
    contactId,
    tagId,
  );
  if (result.status === "contact_not_found") return actionNotFound("Contact");
  if (result.status === "tag_not_found") return actionNotFound("Tag");
  return actionOk({ success: true, tag: result.tag, removed: result.changed });
}
