import { eq, and, desc, inArray, gte } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";

export type ContactActivityType =
  | "form_submitted"
  | "booked"
  | "cancelled"
  | "tag_added"
  | "tag_removed"
  | "workflow_researched";

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

// ─── Contact Service ─────────────────────────────────────────────────────────

export class ContactService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── Contacts CRUD ───────────────────────────────────────────────────────

  async list(projectId: string, opts?: ContactListOptions) {
    let rows = await this.db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.projectId, projectId))
      .orderBy(desc(dbSchema.contacts.createdAt));

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
      const conditions = [
        inArray(dbSchema.contactActivity.contactId, projectContactIds),
      ];
      if (opts.activityType) {
        conditions.push(eq(dbSchema.contactActivity.type, opts.activityType));
      }
      if (opts.activitySinceDays !== undefined && opts.activitySinceDays >= 0) {
        const cutoff = new Date(Date.now() - opts.activitySinceDays * 86400_000);
        conditions.push(gte(dbSchema.contactActivity.createdAt, cutoff));
      }
      const activeRows = await this.db
        .select({ contactId: dbSchema.contactActivity.contactId })
        .from(dbSchema.contactActivity)
        .where(and(...conditions));
      const activeIds = new Set(activeRows.map((r) => r.contactId));
      rows = rows.filter((c) => activeIds.has(c.id));
    }

    if (opts?.noActivitySinceDays !== undefined && opts.noActivitySinceDays >= 0) {
      if (projectContactIds.length === 0) return rows;
      const cutoff = new Date(Date.now() - opts.noActivitySinceDays * 86400_000);
      const recentRows = await this.db
        .select({ contactId: dbSchema.contactActivity.contactId })
        .from(dbSchema.contactActivity)
        .where(
          and(
            inArray(dbSchema.contactActivity.contactId, projectContactIds),
            gte(dbSchema.contactActivity.createdAt, cutoff),
          ),
        );
      const recentIds = new Set(recentRows.map((r) => r.contactId));
      rows = rows.filter((c) => !recentIds.has(c.id));
    }

    if (opts?.bookingStatus) {
      if (projectContactIds.length === 0) return rows;
      const bookingRows = await this.db
        .select({ contactId: dbSchema.bookings.contactId })
        .from(dbSchema.bookings)
        .where(
          and(
            eq(dbSchema.bookings.status, opts.bookingStatus),
            inArray(dbSchema.bookings.contactId, projectContactIds),
          ),
        );
      const matched = new Set(
        bookingRows.map((r) => r.contactId).filter((id): id is string => !!id),
      );
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
    return rows[0] ?? null;
  }

  async getByEmail(projectId: string, email: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.contacts)
      .where(
        and(
          eq(dbSchema.contacts.projectId, projectId),
          eq(dbSchema.contacts.email, email),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async create(
    projectId: string,
    data: {
      name: string;
      email?: string;
      phone?: string;
      notes?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.contacts).values({
      id,
      projectId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      notes: data.notes ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    });
    return this.getById(id);
  }

  async update(
    id: string,
    data: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.email !== undefined) values.email = data.email;
    if (data.phone !== undefined) values.phone = data.phone;
    if (data.notes !== undefined) values.notes = data.notes;
    if (data.metadata !== undefined)
      values.metadata = data.metadata ? JSON.stringify(data.metadata) : null;

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

  // Find or create contact by email (used when booking / form submit)
  async findOrCreate(
    projectId: string,
    data: { name: string; email: string; phone?: string },
  ) {
    const existing = await this.getByEmail(projectId, data.email);
    if (existing) return existing;
    return this.create(projectId, data);
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

  async getContactTags(contactId: string) {
    const rows = await this.db
      .select({
        tagId: dbSchema.contactTags.tagId,
        name: dbSchema.tags.name,
        color: dbSchema.tags.color,
      })
      .from(dbSchema.contactTags)
      .innerJoin(dbSchema.tags, eq(dbSchema.contactTags.tagId, dbSchema.tags.id))
      .where(eq(dbSchema.contactTags.contactId, contactId));
    return rows;
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

    // Log activity
    await this.logActivity(contactId, "tag_added", tagId);
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

    await this.logActivity(contactId, "tag_removed", tagId);
  }

  // Get all contacts with their tags in one go (for list view)
  async listWithTags(projectId: string, opts?: ContactListOptions) {
    const contacts = await this.list(projectId, opts);
    if (contacts.length === 0) return [];

    const contactIds = contacts.map((c) => c.id);
    const allContactTags = await this.db
      .select({
        contactId: dbSchema.contactTags.contactId,
        tagId: dbSchema.contactTags.tagId,
        tagName: dbSchema.tags.name,
        tagColor: dbSchema.tags.color,
      })
      .from(dbSchema.contactTags)
      .innerJoin(dbSchema.tags, eq(dbSchema.contactTags.tagId, dbSchema.tags.id))
      .where(inArray(dbSchema.contactTags.contactId, contactIds));

    return contacts.map((contact) => ({
      ...contact,
      tags: allContactTags
        .filter((t) => t.contactId === contact.id)
        .map((t) => ({ id: t.tagId, name: t.tagName, color: t.tagColor })),
    }));
  }

  // ─── Activity ────────────────────────────────────────────────────────────

  async getActivity(contactId: string, limit = 50) {
    return this.db
      .select()
      .from(dbSchema.contactActivity)
      .where(eq(dbSchema.contactActivity.contactId, contactId))
      .orderBy(desc(dbSchema.contactActivity.createdAt))
      .limit(limit);
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
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }

  // ─── Saved Views ─────────────────────────────────────────────────────────

  async listViews(projectId: string) {
    return this.db
      .select()
      .from(dbSchema.contactViews)
      .where(eq(dbSchema.contactViews.projectId, projectId))
      .orderBy(dbSchema.contactViews.sortOrder, dbSchema.contactViews.createdAt);
  }

  async getView(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.contactViews)
      .where(eq(dbSchema.contactViews.id, id))
      .limit(1);
    return rows[0] ?? null;
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
      config: data.config ? JSON.stringify(data.config) : null,
      sortOrder: data.sortOrder ?? 0,
    });
    return this.getView(id);
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
    if (data.config !== undefined)
      values.config = data.config ? JSON.stringify(data.config) : null;
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
          .set({ config: JSON.stringify(next) })
          .where(eq(dbSchema.contactViews.id, v.id));
      }
    }
  }
}
