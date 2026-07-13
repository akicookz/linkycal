import { eq, and, desc, inArray, gte, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";

export type ContactActivityType =
  | "contact_created"
  | "form_submitted"
  | "booked"
  | "cancelled"
  | "tag_added"
  | "tag_removed"
  | "workflow_researched";

export interface CreateContactInput {
  name: string;
  email?: string | null;
  phone?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  company?: string | null;
  companyWebsite?: string | null;
  position?: string | null;
  companySize?: string | null;
  estimatedRevenue?: string | null;
  linkedinUrl?: string | null;
}

export interface ContactListOptions {
  search?: string;
  tagId?: string;
  tagIds?: string[];
  matchAllTags?: boolean;
  activityType?: ContactActivityType;
  activitySinceDays?: number;
  noActivitySinceDays?: number;
  bookingStatus?: "confirmed" | "cancelled" | "rescheduled" | "pending" | "declined";
}

export const PIPELINE_STAGES: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Lead", color: "#6b7280" },
  { name: "Contacted", color: "#3b82f6" },
  { name: "Meeting scheduled", color: "#6366f1" },
  { name: "Follow up", color: "#f59e0b" },
  { name: "Closed", color: "#10b981" },
];

// Drizzle's { mode: "json" } columns already stringify on write and parse on
// read. Older rows were double-stringified by this service, so a read can
// still yield a JSON string instead of the object — parse those through.
function normalizeJsonColumn(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// D1 rejects any query with more than 100 bound parameters, so an `inArray`
// over the whole contact set breaks once a project passes ~100 contacts. Chunk
// those lists before binding. 90 leaves headroom for the extra bound params
// some of these queries carry alongside the id list (status, cutoff).
const CONTACT_ID_CHUNK = 90;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Email is case-insensitive; store and compare a trimmed, lowercased form so
// `Jane@Acme.com` and `jane@acme.com ` resolve to the same contact.
export function normalizeEmail(
  email: string | null | undefined,
): string | null {
  if (typeof email !== "string") return null;
  const t = email.trim().toLowerCase();
  return t.length > 0 ? t : null;
}


// ─── Contact Service ─────────────────────────────────────────────────────────

export class ContactService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── Contacts CRUD ───────────────────────────────────────────────────────

  async list(projectId: string, opts?: ContactListOptions) {
    let rows = (
      await this.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(dbSchema.contacts.projectId, projectId))
        .orderBy(desc(dbSchema.contacts.createdAt))
    ).map((r) => ({ ...r, metadata: normalizeJsonColumn(r.metadata) }));

    // Client-side search filter (D1 doesn't support ILIKE well)
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)),
      );
    }

    // Combine single tagId + tagIds[] into one set
    const tagIds = [
      ...(opts?.tagId ? [opts.tagId] : []),
      ...(opts?.tagIds ?? []),
    ];

    if (tagIds.length > 0) {
      const taggedRows = await this.db
        .select({
          contactId: dbSchema.contactTags.contactId,
          tagId: dbSchema.contactTags.tagId,
        })
        .from(dbSchema.contactTags)
        .where(inArray(dbSchema.contactTags.tagId, tagIds));

      if (opts?.matchAllTags) {
        const byContact = new Map<string, Set<string>>();
        for (const r of taggedRows) {
          if (!byContact.has(r.contactId)) byContact.set(r.contactId, new Set());
          byContact.get(r.contactId)!.add(r.tagId);
        }
        const required = new Set(tagIds);
        rows = rows.filter((c) => {
          const have = byContact.get(c.id);
          if (!have) return false;
          for (const t of required) if (!have.has(t)) return false;
          return true;
        });
      } else {
        const matchedIds = new Set(taggedRows.map((r) => r.contactId));
        rows = rows.filter((c) => matchedIds.has(c.id));
      }
    }

    // Scope activity/booking lookups to the project's contact set so we
    // never read cross-tenant rows or scan whole tables.
    const projectContactIds = rows.map((r) => r.id);

    if (opts?.activityType || opts?.activitySinceDays !== undefined) {
      if (projectContactIds.length === 0) return rows;
      const extra = [];
      if (opts.activityType) {
        extra.push(eq(dbSchema.contactActivity.type, opts.activityType));
      }
      if (opts.activitySinceDays !== undefined && opts.activitySinceDays >= 0) {
        const cutoff = new Date(Date.now() - opts.activitySinceDays * 86400_000);
        extra.push(gte(dbSchema.contactActivity.createdAt, cutoff));
      }
      const activeIds = new Set<string>();
      for (const ids of chunk(projectContactIds, CONTACT_ID_CHUNK)) {
        const activeRows = await this.db
          .select({ contactId: dbSchema.contactActivity.contactId })
          .from(dbSchema.contactActivity)
          .where(and(inArray(dbSchema.contactActivity.contactId, ids), ...extra));
        for (const r of activeRows) activeIds.add(r.contactId);
      }
      rows = rows.filter((c) => activeIds.has(c.id));
    }

    if (opts?.noActivitySinceDays !== undefined && opts.noActivitySinceDays >= 0) {
      if (projectContactIds.length === 0) return rows;
      const cutoff = new Date(Date.now() - opts.noActivitySinceDays * 86400_000);
      const recentIds = new Set<string>();
      for (const ids of chunk(projectContactIds, CONTACT_ID_CHUNK)) {
        const recentRows = await this.db
          .select({ contactId: dbSchema.contactActivity.contactId })
          .from(dbSchema.contactActivity)
          .where(
            and(
              inArray(dbSchema.contactActivity.contactId, ids),
              gte(dbSchema.contactActivity.createdAt, cutoff),
            ),
          );
        for (const r of recentRows) recentIds.add(r.contactId);
      }
      rows = rows.filter((c) => !recentIds.has(c.id));
    }

    if (opts?.bookingStatus) {
      if (projectContactIds.length === 0) return rows;
      const matched = new Set<string>();
      for (const ids of chunk(projectContactIds, CONTACT_ID_CHUNK)) {
        const bookingRows = await this.db
          .select({ contactId: dbSchema.bookings.contactId })
          .from(dbSchema.bookings)
          .where(
            and(
              eq(dbSchema.bookings.status, opts.bookingStatus),
              inArray(dbSchema.bookings.contactId, ids),
            ),
          );
        for (const r of bookingRows) if (r.contactId) matched.add(r.contactId);
      }
      rows = rows.filter((c) => matched.has(c.id));
    }

    return rows;
  }

  async getById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...row, metadata: normalizeJsonColumn(row.metadata) };
  }

  // Case-insensitive email lookup — matches existing mixed-case rows too, since
  // older contacts were stored before write-time normalization.
  async getByEmail(projectId: string, email: string) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const rows = await this.db
      .select()
      .from(dbSchema.contacts)
      .where(
        and(
          eq(dbSchema.contacts.projectId, projectId),
          sql`lower(trim(${dbSchema.contacts.email})) = ${normalized}`,
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...row, metadata: normalizeJsonColumn(row.metadata) };
  }

  async create(projectId: string, data: CreateContactInput) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.contacts).values({
      id,
      projectId,
      name: data.name,
      email: normalizeEmail(data.email),
      phone: data.phone ?? null,
      notes: data.notes ?? null,
      metadata: data.metadata ?? null,
      company: data.company ?? null,
      companyWebsite: data.companyWebsite ?? null,
      position: data.position ?? null,
      companySize: data.companySize ?? null,
      estimatedRevenue: data.estimatedRevenue ?? null,
      linkedinUrl: data.linkedinUrl ?? null,
    });
    await this.logActivity(id, "contact_created");
    const row = await this.getById(id);
    if (!row) throw new Error("Contact not found after insert");
    return row;
  }

  async update(
    id: string,
    data: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      metadata?: Record<string, unknown> | null;
      company?: string | null;
      companyWebsite?: string | null;
      position?: string | null;
      companySize?: string | null;
      estimatedRevenue?: string | null;
      linkedinUrl?: string | null;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.email !== undefined) values.email = data.email;
    if (data.phone !== undefined) values.phone = data.phone;
    if (data.notes !== undefined) values.notes = data.notes;
    if (data.metadata !== undefined) values.metadata = data.metadata ?? null;
    if (data.company !== undefined) values.company = data.company;
    if (data.companyWebsite !== undefined) values.companyWebsite = data.companyWebsite;
    if (data.position !== undefined) values.position = data.position;
    if (data.companySize !== undefined) values.companySize = data.companySize;
    if (data.estimatedRevenue !== undefined) values.estimatedRevenue = data.estimatedRevenue;
    if (data.linkedinUrl !== undefined) values.linkedinUrl = data.linkedinUrl;

    if (Object.keys(values).length === 0) return this.getById(id);

    await this.db
      .update(dbSchema.contacts)
      .set(values)
      .where(eq(dbSchema.contacts.id, id));

    return this.getById(id);
  }

  async delete(id: string) {
    await this.db
      .delete(dbSchema.contacts)
      .where(eq(dbSchema.contacts.id, id));
  }

  // The existing contact an incoming record would dedupe to, matched strictly by
  // normalized email. Records with no email are always treated as new (we don't
  // merge by name, which would conflate two different people who share a name).
  // Null when it would be a brand-new contact. Shared by findOrCreate and the
  // create routes so their dedup decision stays identical.
  async findDuplicate(
    projectId: string,
    data: { email?: string | null },
  ) {
    const email = normalizeEmail(data.email);
    return email ? this.getByEmail(projectId, email) : null;
  }

  // Find or create a contact, deduped by normalized email (records with no email
  // are always created). Forwards every create field so callers routing through
  // this path don't lose data. Returns whether a brand-new row was created so
  // callers can fire a "new contact" trigger. (create() normalizes email.)
  async findOrCreate(
    projectId: string,
    data: CreateContactInput,
  ): Promise<{ contact: NonNullable<Awaited<ReturnType<ContactService["getById"]>>>; created: boolean }> {
    const existing = await this.findDuplicate(projectId, data);
    if (existing) return { contact: existing, created: false };

    const contact = await this.create(projectId, data);
    return { contact, created: true };
  }

  // ─── Contact with Tags + Activity ────────────────────────────────────────

  async getWithDetails(id: string) {
    const contact = await this.getById(id);
    if (!contact) return null;

    const tags = await this.getContactTags(id);
    const activity = await this.getActivity(id);

    return { ...contact, tags, activity };
  }

  // ─── Tags ────────────────────────────────────────────────────────────────

  async listTags(projectId: string) {
    return this.db
      .select()
      .from(dbSchema.tags)
      .where(eq(dbSchema.tags.projectId, projectId))
      .orderBy(dbSchema.tags.name);
  }

  async createTag(projectId: string, data: { name: string; color?: string }) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.tags).values({
      id,
      projectId,
      name: data.name,
      color: data.color ?? "#6b7280",
    });
    const rows = await this.db
      .select()
      .from(dbSchema.tags)
      .where(eq(dbSchema.tags.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async deleteTag(id: string) {
    // Cascade deletes contact_tags entries
    await this.db.delete(dbSchema.tags).where(eq(dbSchema.tags.id, id));
  }

  async updateTag(
    projectId: string,
    id: string,
    data: { name?: string; color?: string },
  ) {
    const fields: Partial<{ name: string; color: string }> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.color !== undefined) fields.color = data.color;
    const where = and(
      eq(dbSchema.tags.id, id),
      eq(dbSchema.tags.projectId, projectId),
    );
    if (Object.keys(fields).length > 0) {
      await this.db.update(dbSchema.tags).set(fields).where(where);
    }
    const rows = await this.db
      .select()
      .from(dbSchema.tags)
      .where(where)
      .limit(1);
    return rows[0] ?? null;
  }

  async getContactTags(contactId: string) {
    const rows = await this.db
      .select({
        id: dbSchema.contactTags.tagId,
        name: dbSchema.tags.name,
        color: dbSchema.tags.color,
      })
      .from(dbSchema.contactTags)
      .innerJoin(dbSchema.tags, eq(dbSchema.contactTags.tagId, dbSchema.tags.id))
      .where(eq(dbSchema.contactTags.contactId, contactId));
    return rows;
  }

  // ── Ownership guards (routes use these to prevent cross-project mutation) ──
  async contactInProject(projectId: string, contactId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: dbSchema.contacts.id })
      .from(dbSchema.contacts)
      .where(
        and(
          eq(dbSchema.contacts.id, contactId),
          eq(dbSchema.contacts.projectId, projectId),
        ),
      )
      .limit(1);
    return !!row;
  }

  // Subset of tagIds that actually belong to the project (drops foreign ids).
  async filterProjectTagIds(
    projectId: string,
    tagIds: string[],
  ): Promise<string[]> {
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
    const valid = new Set(rows.map((r) => r.id));
    return tagIds.filter((id) => valid.has(id));
  }

  async addTag(contactId: string, tagId: string) {
    // Check if already assigned
    const existing = await this.db
      .select()
      .from(dbSchema.contactTags)
      .where(
        and(
          eq(dbSchema.contactTags.contactId, contactId),
          eq(dbSchema.contactTags.tagId, tagId),
        ),
      )
      .limit(1);

    if (existing.length > 0) return;

    await this.db.insert(dbSchema.contactTags).values({ contactId, tagId });

    // Log activity with the tag name so the timeline can render it
    const tagName = await this.getTagName(tagId);
    await this.logActivity(contactId, "tag_added", tagId, tagName ? { tagName } : undefined);
  }

  async removeTag(contactId: string, tagId: string) {
    await this.db
      .delete(dbSchema.contactTags)
      .where(
        and(
          eq(dbSchema.contactTags.contactId, contactId),
          eq(dbSchema.contactTags.tagId, tagId),
        ),
      );

    const tagName = await this.getTagName(tagId);
    await this.logActivity(contactId, "tag_removed", tagId, tagName ? { tagName } : undefined);
  }

  // Move a contact into a single pipeline stage: drop the board's other stage
  // tags it currently has, then add the target. tagId === null = "Untagged".
  async setStage(
    contactId: string,
    tagId: string | null,
    groupTagIds: string[],
  ): Promise<void> {
    const toRemove = groupTagIds.filter((id) => id !== tagId);
    if (toRemove.length > 0) {
      const existing = await this.db
        .select({ tagId: dbSchema.contactTags.tagId })
        .from(dbSchema.contactTags)
        .where(
          and(
            eq(dbSchema.contactTags.contactId, contactId),
            inArray(dbSchema.contactTags.tagId, toRemove),
          ),
        );
      for (const row of existing) {
        await this.removeTag(contactId, row.tagId);
      }
    }
    if (tagId) {
      await this.addTag(contactId, tagId);
    }
  }

  // Get all contacts with their tags in one go (for MCP + non-paginated callers).
  async listWithTags(projectId: string, opts?: ContactListOptions) {
    return this.decorateWithTags(await this.list(projectId, opts));
  }

  // Paginated slice of the filtered set + the full filtered count, for the
  // list/kanban "Load more" flow. Only the page is decorated, so the tag/
  // activity lookups stay small regardless of how many contacts match.
  async listPage(
    projectId: string,
    opts?: ContactListOptions,
    page?: { limit?: number; offset?: number },
  ) {
    const all = await this.list(projectId, opts);
    const total = all.length;
    const offset = Math.max(0, page?.offset ?? 0);
    const limit = page?.limit ?? 50;
    const contacts = await this.decorateWithTags(all.slice(offset, offset + limit));
    return { contacts, total };
  }

  // Attach each contact's tags + newest-activity timestamp.
  private async decorateWithTags(
    contacts: Awaited<ReturnType<ContactService["list"]>>,
  ) {
    if (contacts.length === 0) return [];

    const contactIds = contacts.map((c) => c.id);

    // Chunked to respect D1's 100-bound-parameter cap (see CONTACT_ID_CHUNK).
    const allContactTags: {
      contactId: string;
      tagId: string;
      tagName: string;
      tagColor: string | null;
    }[] = [];
    for (const ids of chunk(contactIds, CONTACT_ID_CHUNK)) {
      const part = await this.db
        .select({
          contactId: dbSchema.contactTags.contactId,
          tagId: dbSchema.contactTags.tagId,
          tagName: dbSchema.tags.name,
          tagColor: dbSchema.tags.color,
        })
        .from(dbSchema.contactTags)
        .innerJoin(dbSchema.tags, eq(dbSchema.contactTags.tagId, dbSchema.tags.id))
        .where(inArray(dbSchema.contactTags.contactId, ids));
      allContactTags.push(...part);
    }

    // One batched query per chunk (not N+1): newest activity per contact.
    const lastById = new Map<string, number>();
    for (const ids of chunk(contactIds, CONTACT_ID_CHUNK)) {
      const lastActivityRows = await this.db
        .select({
          contactId: dbSchema.contactActivity.contactId,
          last: sql<number>`max(${dbSchema.contactActivity.createdAt})`,
        })
        .from(dbSchema.contactActivity)
        .where(inArray(dbSchema.contactActivity.contactId, ids))
        .groupBy(dbSchema.contactActivity.contactId);
      for (const r of lastActivityRows) lastById.set(r.contactId, r.last);
    }

    return contacts.map((contact) => {
      const last = lastById.get(contact.id);
      return {
        ...contact,
        tags: allContactTags
          .filter((t) => t.contactId === contact.id)
          .map((t) => ({ id: t.tagId, name: t.tagName, color: t.tagColor })),
        // createdAt is unixepoch seconds in D1; convert to ISO for the client.
        lastActivityAt: last != null ? new Date(Number(last) * 1000).toISOString() : null,
      };
    });
  }

  // ─── Activity ────────────────────────────────────────────────────────────

  async getActivity(contactId: string, limit = 50) {
    const rows = await this.db
      .select()
      .from(dbSchema.contactActivity)
      .where(eq(dbSchema.contactActivity.contactId, contactId))
      .orderBy(desc(dbSchema.contactActivity.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, metadata: normalizeJsonColumn(r.metadata) }));
  }

  private async getTagName(tagId: string): Promise<string | null> {
    const [tag] = await this.db
      .select({ name: dbSchema.tags.name })
      .from(dbSchema.tags)
      .where(eq(dbSchema.tags.id, tagId))
      .limit(1);
    return tag?.name ?? null;
  }

  async logActivity(
    contactId: string,
    type: ContactActivityType,
    referenceId?: string,
    metadata?: Record<string, unknown>,
  ) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.contactActivity).values({
      id,
      contactId,
      type,
      referenceId: referenceId ?? null,
      metadata: metadata ?? null,
    });
  }

  // ─── Saved Views ─────────────────────────────────────────────────────────

  async listViews(projectId: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.contactViews)
      .where(eq(dbSchema.contactViews.projectId, projectId))
      .orderBy(dbSchema.contactViews.sortOrder, dbSchema.contactViews.createdAt);
    return rows.map((r) => ({ ...r, config: normalizeJsonColumn(r.config) }));
  }

  async getView(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.contactViews)
      .where(eq(dbSchema.contactViews.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...row, config: normalizeJsonColumn(row.config) };
  }

  async createView(
    projectId: string,
    data: {
      name: string;
      type: "list" | "kanban";
      config?: Record<string, unknown>;
      sortOrder?: number;
    },
  ) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.contactViews).values({
      id,
      projectId,
      name: data.name,
      type: data.type,
      config: data.config ?? null,
      sortOrder: data.sortOrder ?? 0,
    });
    return this.getView(id);
  }

  // One-click starter: create the canonical stage tags + a kanban view whose
  // columns are those tags in pipeline order.
  async seedPipeline(projectId: string) {
    const tagIds: string[] = [];
    for (const stage of PIPELINE_STAGES) {
      const tag = await this.createTag(projectId, { name: stage.name, color: stage.color });
      if (tag) tagIds.push(tag.id);
    }
    const view = await this.createView(projectId, {
      name: "Sales Pipeline",
      type: "kanban",
      config: { pivotTagIds: tagIds, showUntagged: true },
    });
    if (!view) throw new Error("Failed to create pipeline view");
    return { view };
  }

  async updateView(
    projectId: string,
    id: string,
    data: {
      name?: string;
      type?: "list" | "kanban";
      config?: Record<string, unknown> | null;
      sortOrder?: number;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.type !== undefined) values.type = data.type;
    if (data.config !== undefined) values.config = data.config ?? null;
    if (data.sortOrder !== undefined) values.sortOrder = data.sortOrder;

    if (Object.keys(values).length === 0) return this.getView(id);

    await this.db
      .update(dbSchema.contactViews)
      .set(values)
      .where(
        and(
          eq(dbSchema.contactViews.id, id),
          eq(dbSchema.contactViews.projectId, projectId),
        ),
      );

    return this.getView(id);
  }

  async deleteView(projectId: string, id: string) {
    await this.db
      .delete(dbSchema.contactViews)
      .where(
        and(
          eq(dbSchema.contactViews.id, id),
          eq(dbSchema.contactViews.projectId, projectId),
        ),
      );
  }

  // Remove a tagId from the JSON config of every saved view in a project.
  // Called after a tag is deleted so saved views don't point at a dead UUID.
  async pruneTagFromViews(projectId: string, tagId: string) {
    const views = await this.listViews(projectId);
    for (const v of views) {
      if (!v.config) continue;
      const cfg = v.config as {
        tagIds?: string[];
        pivotTagIds?: string[];
        [k: string]: unknown;
      };
      const next = { ...cfg };
      let changed = false;
      if (cfg.tagIds && cfg.tagIds.includes(tagId)) {
        next.tagIds = cfg.tagIds.filter((t) => t !== tagId);
        if (next.tagIds.length === 0) delete next.tagIds;
        changed = true;
      }
      if (cfg.pivotTagIds && cfg.pivotTagIds.includes(tagId)) {
        next.pivotTagIds = cfg.pivotTagIds.filter((t) => t !== tagId);
        if (next.pivotTagIds.length === 0) delete next.pivotTagIds;
        changed = true;
      }
      if (changed) {
        await this.db
          .update(dbSchema.contactViews)
          .set({ config: next })
          .where(eq(dbSchema.contactViews.id, v.id));
      }
    }
  }
}
