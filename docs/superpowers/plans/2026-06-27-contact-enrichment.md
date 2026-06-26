# Contact Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI research populates structured contact fields (company, website, position, company size, estimated revenue, LinkedIn) + appends an executive summary to notes, with an on-demand "Enrich" button gated by a per-plan monthly quota.

**Architecture:** Add six nullable columns to `contacts` + an `enrichments_count` to `usage` (Drizzle migration). The `ai_research` execution path gains a shared `applyResearchToContact` that maps the AI result into the columns and appends the summary to notes — so all research enriches. A new `POST .../enrich` endpoint checks/consumes a monthly quota and enqueues an `enrich` job onto the existing workflow queue; the queue consumer runs `WorkflowExecutionService.enrichContact`. The contact UI shows the fields + an Enrich button with remaining-quota.

**Tech Stack:** Cloudflare Worker + Hono, Drizzle/D1, Vercel AI SDK (OpenAI `gpt-5.2` / Gemini `gemini-2.5-pro`), React + Vite + @tanstack/react-query, bun test.

## Global Constraints

- `verbatimModuleSyntax: true` — type-only imports MUST use `import type`.
- Drizzle migrations: edit `worker/db/schema.ts`, then `bun run db:generate` (NEVER hand-write SQL in `worker/db/drizzle/`). Apply local with `bun run db:migrate:dev`; prod is applied at deploy (`db:migrate:prod`).
- New HTTP endpoints go in the `worker/index.ts` monolith; request-body Zod schemas go in `worker/validation.ts` via `validate(schema, body)`; domain logic in services under `worker/services/` and helpers in `worker/lib/`.
- Plan quota numbers: `maxEnrichmentsPerMonth` → Free **5**, Pro **100**, Business **−1** (unlimited).
- Enrichment usage period = **calendar month, UTC** (`Date.UTC(year, month, 1)`); counter keyed by the project owner's `userId`.
- Do NOT change the AI model ids (`gpt-5.2`, `gemini-2.5-pro`).
- Commands: tests `bun test`; lint `bun run lint`; typecheck+build `bun run build`. Worker tests use `createTestDb()` from `tests/worker/mcp-test-db.ts`.

---

### Task 1: Schema — contact columns + usage counter (migration)

**Files:**
- Modify: `worker/db/schema.ts` (the `contacts` table and the `usage` table)
- Generated: `worker/db/drizzle/*.sql` (via `bun run db:generate`)

**Interfaces:**
- Produces (Drizzle columns, camelCase TS names): `contacts.company`, `contacts.companyWebsite`, `contacts.position`, `contacts.companySize`, `contacts.estimatedRevenue`, `contacts.linkedinUrl` (all `text`, nullable); `usage.enrichmentsCount` (`integer`, NOT NULL default 0).

- [ ] **Step 1: Add the contact columns**

In `worker/db/schema.ts`, inside the `contacts` table definition, after the `notes` column and before `metadata`, add:

```ts
    company: text("company"),
    companyWebsite: text("company_website"),
    position: text("position"),
    companySize: text("company_size"),
    estimatedRevenue: text("estimated_revenue"),
    linkedinUrl: text("linkedin_url"),
```

- [ ] **Step 2: Add the usage counter column**

In the `usage` table definition, after `bookingsCount`, add:

```ts
    enrichmentsCount: integer("enrichments_count").notNull().default(0),
```

- [ ] **Step 3: Generate the migration**

Run: `bun run db:generate`
Expected: a new file under `worker/db/drizzle/` (e.g. `00xx_*.sql`) with `ALTER TABLE contacts ADD ...` and `ALTER TABLE usage ADD ...`. Do not edit it by hand.

- [ ] **Step 4: Apply locally + typecheck**

Run: `bun run db:migrate:dev` then `bun run build`
Expected: migration applies; build passes (Drizzle types now include the new columns).

- [ ] **Step 5: Commit**

```bash
git add worker/db/schema.ts worker/db/drizzle
git commit -m "feat(contacts): add enrichment columns + usage counter (migration)"
```

---

### Task 2: Research result fields + pure enrich helpers

**Files:**
- Modify: `worker/lib/workflow-runtime.ts` (`workflowResearchResultSchema`, ~line 68)
- Create: `worker/lib/contact-enrich.ts`
- Test: `tests/worker/contact-enrich.test.ts`

**Interfaces:**
- Consumes: `WorkflowResearchResult` (from `workflow-runtime.ts`).
- Produces:
  - schema fields `companySize: string | null`, `estimatedRevenue: string | null` on `WorkflowResearchResult`.
  - `interface ContactEnrichFields { company?: string; companyWebsite?: string; position?: string; companySize?: string; estimatedRevenue?: string; linkedinUrl?: string }`
  - `enrichContactFromResearch(result: WorkflowResearchResult): ContactEnrichFields`
  - `appendResearchSummaryToNotes(existingNotes: string | null | undefined, summary: string, date: string): string`

- [ ] **Step 1: Add the two result fields**

In `worker/lib/workflow-runtime.ts`, inside `workflowResearchResultSchema` (after `description: z.string().nullable(),`):

```ts
  companySize: z.string().nullable(),
  estimatedRevenue: z.string().nullable(),
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/worker/contact-enrich.test.ts
import { describe, expect, test } from "bun:test";
import {
  enrichContactFromResearch,
  appendResearchSummaryToNotes,
} from "../../worker/lib/contact-enrich";

const base = {
  summary: "Founder of a SaaS company.",
  company: "Acme Inc", role: "CEO", website: "https://acme.com",
  linkedinUrl: "https://linkedin.com/in/jane", location: "NYC",
  description: null, companySize: "11-50", estimatedRevenue: "$1M-$10M",
  recommendedTags: [], insights: [], sources: [],
};

describe("enrichContactFromResearch", () => {
  test("maps non-empty fields (role->position, website->companyWebsite)", () => {
    expect(enrichContactFromResearch(base)).toEqual({
      company: "Acme Inc", companyWebsite: "https://acme.com", position: "CEO",
      companySize: "11-50", estimatedRevenue: "$1M-$10M",
      linkedinUrl: "https://linkedin.com/in/jane",
    });
  });
  test("omits null/blank values", () => {
    expect(
      enrichContactFromResearch({ ...base, company: null, website: "   ", role: "" }),
    ).toEqual({
      companySize: "11-50", estimatedRevenue: "$1M-$10M",
      linkedinUrl: "https://linkedin.com/in/jane",
    });
  });
});

describe("appendResearchSummaryToNotes", () => {
  test("appends a dated block, preserving existing notes", () => {
    expect(appendResearchSummaryToNotes("Met at a conf.", "Great fit.", "2026-06-27")).toBe(
      "Met at a conf.\n\n— Research summary (2026-06-27) —\nGreat fit.",
    );
  });
  test("returns just the block when there are no existing notes", () => {
    expect(appendResearchSummaryToNotes(null, "Great fit.", "2026-06-27")).toBe(
      "— Research summary (2026-06-27) —\nGreat fit.",
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/worker/contact-enrich.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the helper**

```ts
// worker/lib/contact-enrich.ts
import type { WorkflowResearchResult } from "./workflow-runtime";

export interface ContactEnrichFields {
  company?: string;
  companyWebsite?: string;
  position?: string;
  companySize?: string;
  estimatedRevenue?: string;
  linkedinUrl?: string;
}

function clean(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

// Maps an AI research result into contact column updates, omitting empty values
// so a re-run never blanks a field the AI couldn't find this time.
export function enrichContactFromResearch(
  result: WorkflowResearchResult,
): ContactEnrichFields {
  const out: ContactEnrichFields = {};
  const company = clean(result.company);
  const companyWebsite = clean(result.website);
  const position = clean(result.role);
  const companySize = clean(result.companySize);
  const estimatedRevenue = clean(result.estimatedRevenue);
  const linkedinUrl = clean(result.linkedinUrl);
  if (company) out.company = company;
  if (companyWebsite) out.companyWebsite = companyWebsite;
  if (position) out.position = position;
  if (companySize) out.companySize = companySize;
  if (estimatedRevenue) out.estimatedRevenue = estimatedRevenue;
  if (linkedinUrl) out.linkedinUrl = linkedinUrl;
  return out;
}

// Appends a dated executive-summary block, preserving any existing notes.
export function appendResearchSummaryToNotes(
  existingNotes: string | null | undefined,
  summary: string,
  date: string,
): string {
  const block = `— Research summary (${date}) —\n${summary.trim()}`;
  const base = (existingNotes ?? "").trimEnd();
  return base.length > 0 ? `${base}\n\n${block}` : block;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/worker/contact-enrich.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/workflow-runtime.ts worker/lib/contact-enrich.ts tests/worker/contact-enrich.test.ts
git commit -m "feat(contacts): research result size/revenue + enrich mapping helpers"
```

---

### Task 3: Contact service + validation accept the new columns

**Files:**
- Modify: `worker/services/contact-service.ts` (`create` ~192, `update` ~217)
- Modify: `worker/validation.ts` (`createContactSchema` ~405, `updateContactSchema` ~428)
- Test: `tests/worker/contact-enrich.test.ts` (append a DB-backed test)

**Interfaces:**
- Consumes: `createTestDb` (`tests/worker/mcp-test-db.ts`), `ContactService`.
- Produces: `ContactService.update` and `.create` accept optional `company`, `companyWebsite`, `position`, `companySize`, `estimatedRevenue`, `linkedinUrl` (`string | null`). Validation schemas accept the same six.

- [ ] **Step 1: Write the failing test** (append to `tests/worker/contact-enrich.test.ts`)

```ts
import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { createTestDb } from "./mcp-test-db";

describe("ContactService enrichment columns", () => {
  test("update writes the new columns", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
    await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
    await db.insert(dbSchema.contacts).values({ id: "c", projectId: "p", name: "C" });
    const svc = new ContactService(db);

    const updated = await svc.update("c", {
      company: "Acme", companyWebsite: "https://acme.com", position: "CEO",
      companySize: "11-50", estimatedRevenue: "$1M-$10M",
      linkedinUrl: "https://linkedin.com/in/x",
    });

    expect(updated?.company).toBe("Acme");
    expect(updated?.companyWebsite).toBe("https://acme.com");
    expect(updated?.position).toBe("CEO");
    expect(updated?.companySize).toBe("11-50");
    expect(updated?.estimatedRevenue).toBe("$1M-$10M");
    expect(updated?.linkedinUrl).toBe("https://linkedin.com/in/x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/contact-enrich.test.ts`
Expected: FAIL (TS/`update` ignores unknown fields → columns stay null).

- [ ] **Step 3: Extend `ContactService.update`**

Replace the `data` type and add the field mappings in `update` (`worker/services/contact-service.ts` ~217-242):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/worker/contact-enrich.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the fields to the validation schemas**

In `worker/validation.ts`, add to BOTH `createContactSchema` and `updateContactSchema` (use `.nullable().optional()` in both, since enrich/clearing should be allowed):

```ts
  company: z.string().max(200).nullable().optional(),
  companyWebsite: z.string().max(500).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
  companySize: z.string().max(100).nullable().optional(),
  estimatedRevenue: z.string().max(100).nullable().optional(),
  linkedinUrl: z.string().max(500).nullable().optional(),
```

- [ ] **Step 6: Typecheck + commit**

Run: `bun run build` (expected: passes). Then:

```bash
git add worker/services/contact-service.ts worker/validation.ts tests/worker/contact-enrich.test.ts
git commit -m "feat(contacts): service + validation accept enrichment columns"
```

---

### Task 4: Plan limit + monthly usage counter

**Files:**
- Modify: `worker/types.ts` (`PlanLimits` interface, ~7-18)
- Modify: `worker/lib/plan-limits.ts` (all three plan objects)
- Create: `worker/lib/usage.ts`
- Test: `tests/worker/usage.test.ts`

**Interfaces:**
- Produces:
  - `PlanLimits.maxEnrichmentsPerMonth: number`
  - `currentPeriodStart(now: Date): Date` (UTC month start)
  - `getEnrichmentUsage(db, userId: string, now: Date): Promise<number>`
  - `incrementEnrichmentUsage(db, userId: string, now: Date): Promise<void>`
  - where `db` is `DrizzleD1Database<Record<string, unknown>>`.

- [ ] **Step 1: Add the plan-limit field**

In `worker/types.ts` `PlanLimits` interface, add: `maxEnrichmentsPerMonth: number;`
In `worker/lib/plan-limits.ts`, add to each plan: `free` → `maxEnrichmentsPerMonth: 5,`; `pro` → `maxEnrichmentsPerMonth: 100,`; `business` → `maxEnrichmentsPerMonth: -1,`.

- [ ] **Step 2: Write the failing test**

```ts
// tests/worker/usage.test.ts
import { describe, expect, test } from "bun:test";
import * as dbSchema from "../../worker/db/schema";
import { createTestDb } from "./mcp-test-db";
import {
  currentPeriodStart,
  getEnrichmentUsage,
  incrementEnrichmentUsage,
} from "../../worker/lib/usage";

async function seedUser(db: ReturnType<typeof createTestDb>) {
  await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
}

describe("enrichment usage", () => {
  test("currentPeriodStart is the UTC first-of-month", () => {
    expect(currentPeriodStart(new Date("2026-06-27T15:00:00Z")).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  test("starts at 0, increments within the period, isolates by month", async () => {
    const db = createTestDb();
    await seedUser(db);
    const june = new Date("2026-06-27T00:00:00Z");
    expect(await getEnrichmentUsage(db, "u", june)).toBe(0);
    await incrementEnrichmentUsage(db, "u", june);
    await incrementEnrichmentUsage(db, "u", june);
    expect(await getEnrichmentUsage(db, "u", june)).toBe(2);
    const july = new Date("2026-07-02T00:00:00Z");
    expect(await getEnrichmentUsage(db, "u", july)).toBe(0); // new period resets
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/worker/usage.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `worker/lib/usage.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";

type DB = DrizzleD1Database<Record<string, unknown>>;

// First instant of the current calendar month, UTC — the enrichment quota window.
export function currentPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getEnrichmentUsage(
  db: DB,
  userId: string,
  now: Date,
): Promise<number> {
  const periodStart = currentPeriodStart(now);
  const [row] = await db
    .select({ count: dbSchema.usage.enrichmentsCount })
    .from(dbSchema.usage)
    .where(
      and(
        eq(dbSchema.usage.userId, userId),
        eq(dbSchema.usage.periodStart, periodStart),
      ),
    )
    .limit(1);
  return row?.count ?? 0;
}

export async function incrementEnrichmentUsage(
  db: DB,
  userId: string,
  now: Date,
): Promise<void> {
  const periodStart = currentPeriodStart(now);
  const [row] = await db
    .select({ id: dbSchema.usage.id, count: dbSchema.usage.enrichmentsCount })
    .from(dbSchema.usage)
    .where(
      and(
        eq(dbSchema.usage.userId, userId),
        eq(dbSchema.usage.periodStart, periodStart),
      ),
    )
    .limit(1);
  if (row) {
    await db
      .update(dbSchema.usage)
      .set({ enrichmentsCount: row.count + 1 })
      .where(eq(dbSchema.usage.id, row.id));
  } else {
    await db.insert(dbSchema.usage).values({
      id: crypto.randomUUID(),
      userId,
      periodStart,
      enrichmentsCount: 1,
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/worker/usage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/types.ts worker/lib/plan-limits.ts worker/lib/usage.ts tests/worker/usage.test.ts
git commit -m "feat(plans): maxEnrichmentsPerMonth + monthly usage counter"
```

---

### Task 5: Execution service — research enriches; public `enrichContact`

**Files:**
- Modify: `worker/services/workflow-execution-service.ts` (`executeAiResearch` ~641; add `applyResearchToContact` + `enrichContact`)
- Test: `tests/worker/contact-enrich.test.ts` (append)

**Interfaces:**
- Consumes: `enrichContactFromResearch`, `appendResearchSummaryToNotes` (Task 2); `WorkflowResearchRecord`, `mergeWorkflowResearchMetadata`, `parseRecord` (already imported in the service); `this.contactService`, `this.workflowAiResearchService`.
- Produces:
  - `private async applyResearchToContact(contactId: string, record: WorkflowResearchRecord): Promise<void>`
  - `async enrichContact(projectId: string, contactId: string, env: AppEnv): Promise<void>`

- [ ] **Step 1: Write the failing test** (append to `tests/worker/contact-enrich.test.ts`)

```ts
import { WorkflowExecutionService } from "../../worker/services/workflow-execution-service";

describe("applyResearchToContact (via enrichContact path)", () => {
  test("writes columns + appends summary to notes + logs activity", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({ id: "u2", name: "U", email: "u2@x.com" });
    await db.insert(dbSchema.projects).values({ id: "p2", userId: "u2", name: "P", slug: "p2" });
    await db.insert(dbSchema.contacts).values({ id: "c2", projectId: "p2", name: "Jane", notes: "Met at a conf." });

    const svc = new WorkflowExecutionService(db);
    // Stub the AI call so the test is deterministic (no network).
    (svc as unknown as { workflowAiResearchService: { execute: unknown } }).workflowAiResearchService = {
      execute: async () => ({
        resultKey: "enrichment", provider: "chatgpt", model: "gpt-5.2",
        prompt: "p", executedAt: "2026-06-27T00:00:00Z",
        result: {
          summary: "Great fit.", company: "Acme", role: "CEO", website: "https://acme.com",
          linkedinUrl: "https://linkedin.com/in/jane", location: "NYC", description: null,
          companySize: "11-50", estimatedRevenue: "$1M-$10M", recommendedTags: [], insights: [], sources: [],
        },
      }),
    };

    await svc.enrichContact("p2", "c2", {} as never);

    const [c] = await db.select().from(dbSchema.contacts).where(eq(dbSchema.contacts.id, "c2"));
    expect(c.company).toBe("Acme");
    expect(c.position).toBe("CEO");
    expect(c.companySize).toBe("11-50");
    expect(c.notes).toContain("Met at a conf.");
    expect(c.notes).toContain("Research summary");
    expect(c.notes).toContain("Great fit.");
    const acts = await db.select().from(dbSchema.contactActivity).where(eq(dbSchema.contactActivity.contactId, "c2"));
    expect(acts.some((a) => a.type === "workflow_researched")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/contact-enrich.test.ts`
Expected: FAIL (`svc.enrichContact is not a function`).

- [ ] **Step 3: Add imports + the two methods**

At the top of `worker/services/workflow-execution-service.ts`, add to the existing import from `../lib/contact-enrich` (create the import line):

```ts
import { enrichContactFromResearch, appendResearchSummaryToNotes } from "../lib/contact-enrich";
```

Add these methods to the `WorkflowExecutionService` class (place next to `executeAiResearch`):

```ts
  // Single place that turns a research record into contact updates:
  // metadata envelope + structured columns + appended summary + activity.
  private async applyResearchToContact(
    contactId: string,
    record: WorkflowResearchRecord,
  ): Promise<void> {
    const contact = await this.contactService.getById(contactId);
    const contactMetadata = parseRecord(contact?.metadata);
    const nextMetadata = mergeWorkflowResearchMetadata(contactMetadata, record);
    const fields = enrichContactFromResearch(record.result);
    const today = new Date().toISOString().slice(0, 10);
    const nextNotes = appendResearchSummaryToNotes(
      contact?.notes ?? null,
      record.result.summary,
      today,
    );
    await this.contactService.update(contactId, {
      ...fields,
      metadata: nextMetadata,
      notes: nextNotes,
    });
    await this.contactService.logActivity(contactId, "workflow_researched", undefined, {
      provider: record.provider,
      model: record.model,
      resultKey: record.resultKey,
      summary: record.result.summary,
      sourceCount: record.result.sources.length,
    });
  }

  // On-demand enrichment (called by the queue consumer for `enrich` jobs).
  async enrichContact(projectId: string, contactId: string, env: AppEnv): Promise<void> {
    const contact = await this.contactService.getById(contactId);
    if (!contact || contact.projectId !== projectId) return;
    const prompt =
      `Research this contact and their company using public sources: ` +
      `${contact.name}${contact.email ? ` <${contact.email}>` : ""}. ` +
      `Return the company name, company website, the person's position/title, ` +
      `the company's size (employee range), an estimated annual revenue range, ` +
      `their LinkedIn URL, and a concise executive summary for sales outreach.`;
    const record = await this.workflowAiResearchService.execute(
      { provider: "chatgpt", prompt, resultKey: "enrichment" },
      env,
    );
    await this.applyResearchToContact(contactId, record);
  }
```

- [ ] **Step 4: Make `executeAiResearch` reuse `applyResearchToContact`**

In `executeAiResearch`, replace the block that does the metadata write + activity log (the lines from `const contact = await this.contactService.getById(contactId);` through the `logActivity(...)` call, ~674-685) with:

```ts
    await this.applyResearchToContact(contactId, record);
```

(Keep the subsequent `context.metadata = mergeWorkflowResearchMetadata(context.metadata, record);` and the `snap.output = {...}` block unchanged.)

- [ ] **Step 5: Run test + full suite**

Run: `bun test tests/worker/contact-enrich.test.ts` (expected: PASS), then `bun run build` (expected: passes).

- [ ] **Step 6: Commit**

```bash
git add worker/services/workflow-execution-service.ts tests/worker/contact-enrich.test.ts
git commit -m "feat(contacts): research enriches columns + notes; enrichContact()"
```

---

### Task 6: Enrich endpoint, usage endpoint, queue enrich job

**Files:**
- Modify: `worker/index.ts` (add two routes near the other contact routes ~5260; extend the `queue` consumer ~6961)

**Interfaces:**
- Consumes: `resolveProjectEntitlements` (already imported from `./lib/entitlements`), `getEnrichmentUsage`/`incrementEnrichmentUsage` (Task 4), `ContactService.contactInProject`, `WorkflowExecutionService.enrichContact` (Task 5), `c.env.WORKFLOW_QUEUE`.
- Produces:
  - `POST /api/projects/:projectId/contacts/:contactId/enrich` → `{ success, remaining, unlimited }` or 403/404.
  - `GET /api/projects/:projectId/enrichment-usage` → `{ used, limit, remaining, unlimited }`.
  - Queue body union accepts `{ kind: "enrich"; projectId; contactId }`.

- [ ] **Step 1: Import the usage helpers**

At the top of `worker/index.ts`, add: `import { getEnrichmentUsage, incrementEnrichmentUsage } from "./lib/usage";`

- [ ] **Step 2: Add the two routes** (after the `.../stage` route, ~line 5260)

```ts
app.post("/api/projects/:projectId/contacts/:contactId/enrich", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const contactId = c.req.param("contactId");
    const db = c.get("db");
    const service = new ContactService(db);
    if (!(await service.contactInProject(projectId, contactId))) {
      return c.json({ error: "Contact not found" }, 404);
    }
    const ent = await resolveProjectEntitlements(db, projectId, { ensureSubscription: true });
    if (!ent) return c.json({ error: "Project not found" }, 404);
    const limit = ent.planLimits.maxEnrichmentsPerMonth;
    const now = new Date();
    const used = await getEnrichmentUsage(db, ent.ownerUserId, now);
    if (limit !== -1 && used >= limit) {
      return c.json({ error: "Monthly enrichment limit reached", used, limit }, 403);
    }
    await incrementEnrichmentUsage(db, ent.ownerUserId, now);
    await c.env.WORKFLOW_QUEUE.send({ kind: "enrich", projectId, contactId });
    const remaining = limit === -1 ? -1 : Math.max(0, limit - (used + 1));
    return c.json({ success: true, remaining, unlimited: limit === -1 });
  } catch (err) {
    console.error("Enrich error:", err);
    return c.json({ error: "Failed to start enrichment" }, 500);
  }
});

app.get("/api/projects/:projectId/enrichment-usage", async (c) => {
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const ent = await resolveProjectEntitlements(db, projectId);
  if (!ent) return c.json({ error: "Project not found" }, 404);
  const limit = ent.planLimits.maxEnrichmentsPerMonth;
  const used = await getEnrichmentUsage(db, ent.ownerUserId, new Date());
  const unlimited = limit === -1;
  return c.json({ used, limit, remaining: unlimited ? -1 : Math.max(0, limit - used), unlimited });
});
```

- [ ] **Step 3: Extend the queue consumer** (~line 6961)

Change the `queue` signature's `MessageBatch<...>` type to a union and branch on it:

```ts
  async queue(
    batch: MessageBatch<
      | { workflowRunId: string; stepIndex: number; remainingDelay?: number }
      | { kind: "enrich"; projectId: string; contactId: string }
    >,
    env: import("./types").AppEnv,
  ) {
    const db = drizzle(env.DB, { schema });
    const executionService = new WorkflowExecutionService(db);

    for (const message of batch.messages) {
      try {
        const body = message.body;
        if ("kind" in body && body.kind === "enrich") {
          await executionService.enrichContact(body.projectId, body.contactId, env);
        } else {
          const { workflowRunId, stepIndex, remainingDelay } = body;
          if (remainingDelay !== undefined && remainingDelay > 0) {
            await executionService.continueWait(workflowRunId, stepIndex, remainingDelay, env);
          } else {
            await executionService.executeStep(workflowRunId, stepIndex, env);
          }
        }
        message.ack();
      } catch (err) {
        console.error("Queue message failed:", err);
        message.retry();
      }
    }
  },
```

- [ ] **Step 4: Typecheck + lint**

Run: `bun run build` then `bun run lint`
Expected: build passes; no new errors in `worker/index.ts`/`worker/lib/usage.ts`.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts
git commit -m "feat(contacts): enrich + enrichment-usage endpoints; queue enrich job"
```

---

### Task 7: Workflow template "Research & Enrich Contact"

**Files:**
- Modify: `src/lib/workflow-templates.ts` (`manual-contact-research`, ~94-126)
- Modify: `tests/workflow-templates.test.ts`

**Interfaces:**
- Consumes: existing template types.
- Produces: template id stays `manual-contact-research`; name `"Research & Enrich Contact"`; steps = `ai_research` (enrichment prompt) + `send_email` (no `update_contact`).

- [ ] **Step 1: Check the existing template test expectations**

Run: `bun test tests/workflow-templates.test.ts`
Expected: PASS now (baseline). Note any assertion that references `manual-contact-research`'s name/steps so you update them in Step 3.

- [ ] **Step 2: Replace the template definition**

Replace the `manual-contact-research` object (~94-126) with:

```ts
  {
    id: "manual-contact-research",
    name: "Research & Enrich Contact",
    description:
      "Research a selected contact, enrich their company, role, size, revenue and LinkedIn, and append an executive summary to notes.",
    trigger: "manual",
    steps: [
      {
        type: "ai_research",
        config: {
          provider: "chatgpt",
          resultKey: "enrichment",
          prompt:
            "Research this contact and their company using public sources. Return the company name, company website, the person's position/title, the company's size (employee range), an estimated annual revenue range, their LinkedIn URL, and a concise executive summary for outreach.",
        },
      },
      {
        type: "send_email",
        config: {
          toList: ["team@example.com"],
          subject: "Contact enriched: {{contact.name}}",
          body:
            "<p><strong>Summary</strong></p><p>{{research.summary}}</p><p><strong>Company</strong>: {{research.company}} ({{research.companySize}})</p><p><strong>Position</strong>: {{research.role}}</p><p><strong>LinkedIn</strong>: {{research.linkedinUrl}}</p>",
        },
      },
    ],
  },
```

- [ ] **Step 3: Update the template test**

In `tests/workflow-templates.test.ts`, update any assertion about `manual-contact-research` to match the new name `"Research & Enrich Contact"` and the 2-step shape (ai_research + send_email; no update_contact). If the test only checks generic invariants (every template has id/name/steps), no change is needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/workflow-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow-templates.ts tests/workflow-templates.test.ts
git commit -m "feat(workflows): Research & Enrich Contact template"
```

---

### Task 8: Contact detail UI — fields + Enrich button

**Files:**
- Modify: `src/pages/ContactDetail.tsx`

**Interfaces:**
- Consumes: `POST .../enrich` and `GET .../enrichment-usage` (Task 6); the new contact columns (returned by the existing contact query). `InlineField`, `updateMutation`, `Button`, `PageHeader`, `useQuery`/`useMutation`/`queryClient` already in the file.
- Produces: the six fields render + edit inline; an Enrich button with quota + progress.

- [ ] **Step 1: Extend the `ContactDetail` interface** (~50-62)

Add to the interface: `company: string | null; companyWebsite: string | null; position: string | null; companySize: string | null; estimatedRevenue: string | null; linkedinUrl: string | null;`

- [ ] **Step 2: Render the six fields** in the Contact Information card

After the notes `InlineField` block (~490, before the closing `</div>` of the details group), add (reuses the existing `InlineField` + `updateMutation` pattern; uses lucide icons `Building2`, `Globe`, `Briefcase`, `Users`, `DollarSign`, `Linkedin` — add them to the file's lucide import):

```tsx
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`company-${contact.id}`} value={contact.company}
                    placeholder="Add company..." onSave={(v) => updateMutation.mutate({ company: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`position-${contact.id}`} value={contact.position}
                    placeholder="Add position..." onSave={(v) => updateMutation.mutate({ position: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`website-${contact.id}`} value={contact.companyWebsite}
                    placeholder="Add company website..." onSave={(v) => updateMutation.mutate({ companyWebsite: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`size-${contact.id}`} value={contact.companySize}
                    placeholder="Add company size..." onSave={(v) => updateMutation.mutate({ companySize: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`revenue-${contact.id}`} value={contact.estimatedRevenue}
                    placeholder="Add estimated revenue..." onSave={(v) => updateMutation.mutate({ estimatedRevenue: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Linkedin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`linkedin-${contact.id}`} value={contact.linkedinUrl}
                    placeholder="Add LinkedIn URL..." onSave={(v) => updateMutation.mutate({ linkedinUrl: v })} />
                </div>
```

- [ ] **Step 3: Add the usage query + enrich mutation + enriching state**

Near the other hooks in the component body, add (uses `projectId`, `contactId`, `queryClient` already present; add `Sparkles` + `Loader` to the lucide import if not present):

```tsx
  const [enriching, setEnriching] = useState(false);
  const enrichBaselineRef = useRef<number | null>(null);

  const { data: enrichUsage } = useQuery<{ used: number; limit: number; remaining: number; unlimited: boolean }>({
    queryKey: ["projects", projectId, "enrichment-usage"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/enrichment-usage`);
      if (!res.ok) throw new Error("Failed to load usage");
      return res.json();
    },
    enabled: !!projectId,
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}/enrich`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to start enrichment");
      }
      return res.json();
    },
    onSuccess: () => {
      enrichBaselineRef.current = contact?.activity.length ?? 0;
      setEnriching(true);
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "enrichment-usage"] });
    },
  });

  // While enriching, poll the contact until a new activity (the research) lands.
  useEffect(() => {
    if (!enriching) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts", contactId] });
    }, 4000);
    const timeout = setTimeout(() => setEnriching(false), 90000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [enriching, projectId, contactId, queryClient]);

  useEffect(() => {
    if (!enriching || enrichBaselineRef.current === null || !contact) return;
    if (contact.activity.length > enrichBaselineRef.current) {
      setEnriching(false);
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "enrichment-usage"] });
    }
  }, [contact, enriching, projectId, queryClient]);
```

- [ ] **Step 4: Add the Enrich button to the page header** (~389-397)

Replace the `PageHeader` children with the Back button plus the Enrich button:

```tsx
      <PageHeader title={contact.name} description={`Added ${formatFullDate(contact.createdAt)}`}>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={() => enrichMutation.mutate()}
          disabled={
            enriching || enrichMutation.isPending ||
            (!!enrichUsage && !enrichUsage.unlimited && enrichUsage.remaining <= 0)
          }
          title={
            enrichUsage && !enrichUsage.unlimited && enrichUsage.remaining <= 0
              ? "Monthly enrichment limit reached — upgrade for more"
              : undefined
          }
        >
          {enriching || enrichMutation.isPending ? (
            <><Loader className="h-4 w-4 animate-spin" /> Enriching…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Enrich
              {enrichUsage && !enrichUsage.unlimited ? ` (${enrichUsage.remaining} left)` : ""}
            </>
          )}
        </Button>
      </PageHeader>
```

- [ ] **Step 5: Typecheck + lint**

Run: `bun run build` then `bun run lint`
Expected: build passes; no new errors in `ContactDetail.tsx`. Ensure all new lucide icons (`Building2`, `Briefcase`, `Globe`, `Users`, `DollarSign`, `Linkedin`, `Sparkles`, `Loader`) are imported, and `useEffect`/`useRef`/`useState` are imported.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ContactDetail.tsx
git commit -m "feat(contacts): enrichment fields + Enrich button with monthly quota"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Tests** — Run: `bun test` — Expected: all pass (new `contact-enrich`, `usage`, updated `workflow-templates`).
- [ ] **Step 2: Lint + build** — Run: `bun run lint && bun run build` — Expected: no new errors in touched files; build succeeds.
- [ ] **Step 3: Visual (dev server + headless Chrome, logged in)** — On a contact detail page:
  1. The six new fields render and are inline-editable (save persists on reload).
  2. Click **Enrich** → button shows "Enriching…" → after the job completes the fields + a dated "Research summary" notes block populate; the "(N left)" counter decrements.
  3. Exhaust/Free-plan path: when `remaining` hits 0, the button is disabled with the upgrade tooltip.
- [ ] **Step 4: Commit** any verification fixes:

```bash
git add -A && git commit -m "fix(contacts): enrichment verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** new columns (T1) + usage column (T1); research size/revenue + mapping (T2); service/validation columns (T3); plan limit + monthly counter (T4); research-always-enriches + on-demand enrichContact (T5); enrich/usage endpoints + async queue job, count-at-enqueue (T6); template rename/prompt (T7); UI fields + Enrich button + quota display/disable (T8). All covered.
- **Type consistency:** `enrichContactFromResearch`/`appendResearchSummaryToNotes` signatures identical across T2/T5; `getEnrichmentUsage`/`incrementEnrichmentUsage(db, userId, now)` identical T4/T6; `enrichContact(projectId, contactId, env)` identical T5/T6; queue body union identical to the enqueue payload in T6; `maxEnrichmentsPerMonth` used consistently (−1 = unlimited).
- **Decisions honored:** monthly reset (calendar month UTC); research = enrich everywhere; async enqueue with count-at-enqueue; notes appended (not replaced).
