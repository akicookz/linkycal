import { eq, and, desc, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";

// ─── Contact Service ─────────────────────────────────────────────────────────

export class ContactService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── Contacts CRUD ───────────────────────────────────────────────────────

  async list(projectId: string, opts?: { search?: string; tagId?: string }) {
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

    // If filtering by tag, get contact IDs with that tag
    if (opts?.tagId) {
      const taggedContacts = await this.db
        .select({ contactId: dbSchema.contactTags.contactId })
        .from(dbSchema.contactTags)
        .where(eq(dbSchema.contactTags.tagId, opts.tagId));

      const taggedIds = new Set(taggedContacts.map((t) => t.contactId));
      rows = rows.filter((c) => taggedIds.has(c.id));
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
  async listWithTags(projectId: string, opts?: { search?: string; tagId?: string }) {
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
    type: "form_submitted" | "booked" | "cancelled" | "tag_added" | "tag_removed",
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
}
