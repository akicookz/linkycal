import {
  and,
  asc,
  eq,
  gt,
  inArray,
  like,
  or,
  sql,
} from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";

export interface TagListOptions {
  search?: string;
  limit?: number;
  cursor?: string | null;
}

export interface TagListPage {
  tags: dbSchema.TagRow[];
  nextCursor: string | null;
}

interface TagCursor {
  name: string;
  id: string;
}

export type TagAssignmentResult =
  | { status: "contact_not_found" }
  | { status: "tag_not_found" }
  | { status: "ok"; tag: dbSchema.TagRow; changed: boolean };

export interface TagWorkflowReference {
  id: string;
  name: string;
}

export type TagDeleteResult =
  | { status: "not_found" }
  | { status: "in_use"; workflows: TagWorkflowReference[] }
  | { status: "deleted"; tag: dbSchema.TagRow };

export class TagNameConflictError extends Error {
  constructor() {
    super("A tag with this name already exists");
    this.name = "TagNameConflictError";
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeTagCursor(tag: Pick<dbSchema.TagRow, "name" | "id">): string {
  return encodeBase64Url(
    JSON.stringify({ name: tag.name.toLowerCase(), id: tag.id }),
  );
}

export function parseTagCursor(value: string | null | undefined): TagCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid cursor");
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.name !== "string" ||
      typeof record.id !== "string" ||
      record.id.length === 0
    ) {
      throw new Error("Invalid cursor");
    }
    return { name: record.name, id: record.id };
  } catch {
    throw new Error("Invalid tag cursor");
  }
}

function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return normalizeJson(JSON.parse(value));
  } catch {
    return value;
  }
}

function containsTagReference(value: unknown, tagId: string): boolean {
  const normalized = normalizeJson(value);
  if (normalized === tagId) return true;
  if (Array.isArray(normalized)) {
    return normalized.some((entry) => containsTagReference(entry, tagId));
  }
  if (normalized && typeof normalized === "object") {
    return Object.values(normalized).some((entry) =>
      containsTagReference(entry, tagId),
    );
  }
  return false;
}

// ─── Tag Service ─────────────────────────────────────────────────────────────

export class TagService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  async list(projectId: string, options: TagListOptions = {}): Promise<TagListPage> {
    const normalizedSearch = options.search?.trim().toLowerCase() ?? "";
    const cursor = parseTagCursor(options.cursor);
    const lowerName = sql<string>`lower(${dbSchema.tags.name})`;
    const conditions = [eq(dbSchema.tags.projectId, projectId)];

    if (normalizedSearch) {
      conditions.push(like(lowerName, `%${normalizedSearch}%`));
    }
    if (cursor) {
      const cursorCondition = or(
        gt(lowerName, cursor.name),
        and(eq(lowerName, cursor.name), gt(dbSchema.tags.id, cursor.id)),
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }

    const query = this.db
      .select()
      .from(dbSchema.tags)
      .where(and(...conditions))
      .orderBy(asc(lowerName), asc(dbSchema.tags.id));

    if (options.limit === undefined) {
      return { tags: await query, nextCursor: null };
    }

    const rows = await query.limit(options.limit + 1);
    const hasMore = rows.length > options.limit;
    const tags = hasMore ? rows.slice(0, options.limit) : rows;
    return {
      tags,
      nextCursor:
        hasMore && tags.length > 0 ? encodeTagCursor(tags[tags.length - 1]) : null,
    };
  }

  async listAll(projectId: string): Promise<dbSchema.TagRow[]> {
    return (await this.list(projectId)).tags;
  }

  async get(projectId: string, tagId: string): Promise<dbSchema.TagRow | null> {
    const [tag] = await this.db
      .select()
      .from(dbSchema.tags)
      .where(
        and(
          eq(dbSchema.tags.projectId, projectId),
          eq(dbSchema.tags.id, tagId),
        ),
      )
      .limit(1);
    return tag ?? null;
  }

  async findByName(
    projectId: string,
    name: string,
    excludeId?: string,
  ): Promise<dbSchema.TagRow | null> {
    const normalizedName = name.trim().toLowerCase();
    const rows = await this.db
      .select()
      .from(dbSchema.tags)
      .where(
        and(
          eq(dbSchema.tags.projectId, projectId),
          eq(sql<string>`lower(${dbSchema.tags.name})`, normalizedName),
        ),
      );
    return rows.find((tag) => tag.id !== excludeId) ?? null;
  }

  async create(
    projectId: string,
    data: { name: string; color?: string },
  ): Promise<dbSchema.TagRow> {
    const name = data.name.trim();
    if (await this.findByName(projectId, name)) throw new TagNameConflictError();

    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.tags).values({
      id,
      projectId,
      name,
      color: data.color ?? "#6b7280",
    });
    const tag = await this.get(projectId, id);
    if (!tag) throw new Error("Failed to create tag");
    return tag;
  }

  async update(
    projectId: string,
    tagId: string,
    data: { name?: string; color?: string },
  ): Promise<dbSchema.TagRow | null> {
    const existing = await this.get(projectId, tagId);
    if (!existing) return null;

    const values: Partial<{ name: string; color: string }> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (await this.findByName(projectId, name, tagId)) {
        throw new TagNameConflictError();
      }
      values.name = name;
    }
    if (data.color !== undefined) values.color = data.color;

    if (Object.keys(values).length > 0) {
      await this.db
        .update(dbSchema.tags)
        .set(values)
        .where(
          and(
            eq(dbSchema.tags.projectId, projectId),
            eq(dbSchema.tags.id, tagId),
          ),
        );
    }
    return this.get(projectId, tagId);
  }

  async filterProjectTagIds(projectId: string, tagIds: string[]): Promise<string[]> {
    if (tagIds.length === 0) return [];
    const rows = await this.db
      .select({ id: dbSchema.tags.id })
      .from(dbSchema.tags)
      .where(
        and(
          eq(dbSchema.tags.projectId, projectId),
          inArray(dbSchema.tags.id, tagIds),
        ),
      );
    const valid = new Set(rows.map((row) => row.id));
    return tagIds.filter((id) => valid.has(id));
  }

  async assignToContact(
    projectId: string,
    contactId: string,
    tagId: string,
  ): Promise<TagAssignmentResult> {
    if (!(await this.contactInProject(projectId, contactId))) {
      return { status: "contact_not_found" };
    }
    const tag = await this.get(projectId, tagId);
    if (!tag) return { status: "tag_not_found" };
    return {
      status: "ok",
      tag,
      changed: await this.addTag(contactId, tagId, tag.name),
    };
  }

  async removeFromContact(
    projectId: string,
    contactId: string,
    tagId: string,
  ): Promise<TagAssignmentResult> {
    if (!(await this.contactInProject(projectId, contactId))) {
      return { status: "contact_not_found" };
    }
    const tag = await this.get(projectId, tagId);
    if (!tag) return { status: "tag_not_found" };
    return {
      status: "ok",
      tag,
      changed: await this.removeTag(contactId, tagId, tag.name),
    };
  }

  async addTag(
    contactId: string,
    tagId: string,
    knownTagName?: string,
  ): Promise<boolean> {
    if (await this.hasAssignment(contactId, tagId)) return false;
    await this.db.insert(dbSchema.contactTags).values({ contactId, tagId });
    const tagName = knownTagName ?? (await this.getTagName(tagId));
    await this.logTagActivity(contactId, "tag_added", tagId, tagName);
    return true;
  }

  async removeTag(
    contactId: string,
    tagId: string,
    knownTagName?: string,
  ): Promise<boolean> {
    if (!(await this.hasAssignment(contactId, tagId))) return false;
    const tagName = knownTagName ?? (await this.getTagName(tagId));
    await this.db
      .delete(dbSchema.contactTags)
      .where(
        and(
          eq(dbSchema.contactTags.contactId, contactId),
          eq(dbSchema.contactTags.tagId, tagId),
        ),
      );
    await this.logTagActivity(contactId, "tag_removed", tagId, tagName);
    return true;
  }

  async delete(projectId: string, tagId: string): Promise<TagDeleteResult> {
    const tag = await this.get(projectId, tagId);
    if (!tag) return { status: "not_found" };

    const workflows = await this.workflowReferences(projectId, tagId);
    if (workflows.length > 0) return { status: "in_use", workflows };

    await this.pruneTagFromViews(projectId, tagId);
    await this.db
      .delete(dbSchema.tags)
      .where(
        and(
          eq(dbSchema.tags.projectId, projectId),
          eq(dbSchema.tags.id, tagId),
        ),
      );
    return { status: "deleted", tag };
  }

  private async contactInProject(projectId: string, contactId: string): Promise<boolean> {
    const [contact] = await this.db
      .select({ id: dbSchema.contacts.id })
      .from(dbSchema.contacts)
      .where(
        and(
          eq(dbSchema.contacts.projectId, projectId),
          eq(dbSchema.contacts.id, contactId),
        ),
      )
      .limit(1);
    return !!contact;
  }

  private async hasAssignment(contactId: string, tagId: string): Promise<boolean> {
    const [assignment] = await this.db
      .select({ tagId: dbSchema.contactTags.tagId })
      .from(dbSchema.contactTags)
      .where(
        and(
          eq(dbSchema.contactTags.contactId, contactId),
          eq(dbSchema.contactTags.tagId, tagId),
        ),
      )
      .limit(1);
    return !!assignment;
  }

  private async getTagName(tagId: string): Promise<string | null> {
    const [tag] = await this.db
      .select({ name: dbSchema.tags.name })
      .from(dbSchema.tags)
      .where(eq(dbSchema.tags.id, tagId))
      .limit(1);
    return tag?.name ?? null;
  }

  private async logTagActivity(
    contactId: string,
    type: "tag_added" | "tag_removed",
    tagId: string,
    tagName: string | null,
  ): Promise<void> {
    await this.db.insert(dbSchema.contactActivity).values({
      id: crypto.randomUUID(),
      contactId,
      type,
      referenceId: tagId,
      metadata: tagName ? { tagName } : null,
    });
  }

  private async workflowReferences(
    projectId: string,
    tagId: string,
  ): Promise<TagWorkflowReference[]> {
    const workflows = await this.db
      .select()
      .from(dbSchema.workflows)
      .where(eq(dbSchema.workflows.projectId, projectId));
    const steps = await this.db
      .select({
        workflowId: dbSchema.workflows.id,
        workflowName: dbSchema.workflows.name,
        config: dbSchema.workflowSteps.config,
        condition: dbSchema.workflowSteps.condition,
      })
      .from(dbSchema.workflowSteps)
      .innerJoin(
        dbSchema.workflows,
        eq(dbSchema.workflowSteps.workflowId, dbSchema.workflows.id),
      )
      .where(eq(dbSchema.workflows.projectId, projectId));

    const references = new Map<string, TagWorkflowReference>();
    for (const workflow of workflows) {
      if (containsTagReference(workflow.triggerConfig, tagId)) {
        references.set(workflow.id, { id: workflow.id, name: workflow.name });
      }
    }
    for (const step of steps) {
      if (
        containsTagReference(step.config, tagId) ||
        containsTagReference(step.condition, tagId)
      ) {
        references.set(step.workflowId, {
          id: step.workflowId,
          name: step.workflowName,
        });
      }
    }
    return [...references.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private async pruneTagFromViews(projectId: string, tagId: string): Promise<void> {
    const views = await this.db
      .select()
      .from(dbSchema.contactViews)
      .where(eq(dbSchema.contactViews.projectId, projectId));
    for (const view of views) {
      const config = normalizeJson(view.config);
      if (!config || typeof config !== "object" || Array.isArray(config)) continue;
      const current = config as Record<string, unknown>;
      const next = { ...current };
      let changed = false;
      for (const key of ["tagIds", "pivotTagIds"] as const) {
        const ids = current[key];
        if (!Array.isArray(ids) || !ids.includes(tagId)) continue;
        const remaining = ids.filter((id) => id !== tagId);
        if (remaining.length > 0) next[key] = remaining;
        else delete next[key];
        changed = true;
      }
      if (changed) {
        await this.db
          .update(dbSchema.contactViews)
          .set({ config: next })
          .where(eq(dbSchema.contactViews.id, view.id));
      }
    }
  }
}
