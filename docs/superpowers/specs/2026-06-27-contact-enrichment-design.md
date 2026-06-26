# Contact enrichment

Date: 2026-06-27
Status: Approved

## Goal

Turn contact "research" into structured **enrichment**: AI research populates
proper contact columns (company, website, position, company size, estimated
revenue, LinkedIn) and appends an executive summary to notes — not just a blob in
metadata. Add an **Enrich** button on the contact that runs this on demand,
respecting a per-plan monthly enrichment quota.

## What exists today (anchors)

- `ai_research` step: `worker/services/workflow-execution-service.ts` `executeAiResearch()` (~641-701). It writes **only** `contacts.metadata` (`workflow.research.latest` + `byKey`, via `mergeWorkflowResearchMetadata` in `worker/lib/workflow-runtime.ts` ~233-249) and logs a `workflow_researched` activity. Notes are only touched by a separate `update_contact` step in templates.
- AI providers: `worker/services/workflow-ai-research-service.ts` — ChatGPT (`gpt-5.2`) / Gemini (`gemini-2.5-pro`) via structured `Output.object(workflowResearchResultSchema)` + web search. Result schema `workflowResearchResultSchema` (`workflow-runtime.ts` ~68-85): `summary, company, role, website, linkedinUrl, location, description, recommendedTags, insights, sources[]`.
- Templates: `src/lib/workflow-templates.ts` — includes `manual-contact-research` (trigger `manual`: ai_research → update_contact(notes) → send_email).
- Plan limits: `worker/types.ts` `PlanLimits` (~7-18); numbers in `worker/lib/plan-limits.ts` (~5-45). Only caps **counts**; no per-run/usage tracking.
- Usage table: `worker/db/schema.ts` `usage` — per `userId`, `periodStart`, `formResponses`, `bookingsCount`.
- Contact detail: `src/pages/ContactDetail.tsx` — query (~176), Contact Info card (~438-492), "Latest Research" card (~635).
- Manual run: `POST /api/projects/:projectId/workflows/:workflowId/trigger` with `{ contactId }` (~5540).

## 1. Schema — new contact columns (one D1 migration)

Add to `contacts` (all `text`, nullable): `company`, `company_website`,
`position`, `company_size`, `estimated_revenue`, `linkedin_url`. Add
`enrichments_count integer NOT NULL DEFAULT 0` to `usage`.
Generate the migration with `bun run db:generate` (never hand-write SQL); apply
local + prod.

## 2. Research result + prompt

- Extend `workflowResearchResultSchema` with `companySize: z.string().nullable()`
  and `estimatedRevenue: z.string().nullable()` (free-text ranges, e.g.
  "11–50", "$1M–$10M"). Both providers return them automatically (structured output).
- Update the research prompt(s) to ask for company size and estimated revenue.

## 3. Shared enrichment mapping (research = enrich)

New helper `enrichContactFromResearch(result): Partial<Contact>` (place in
`worker/lib/workflow-runtime.ts` or a small `worker/lib/contact-enrich.ts`) that
maps a `WorkflowResearchResult` → column updates, including only non-empty values:
`company←company`, `companyWebsite←website`, `position←role`,
`companySize←companySize`, `estimatedRevenue←estimatedRevenue`,
`linkedinUrl←linkedinUrl`.

In `executeAiResearch` (after writing metadata), also:
1. apply `enrichContactFromResearch(result)` to the contact via `contactService.update`;
2. **append** the executive summary to `notes`: existing notes + a dated block
   `\n\n— Research summary (YYYY-MM-DD) —\n{result.summary}` (preserve user notes;
   re-enrich appends another dated block).

This makes every `ai_research` run enrich the columns + notes (the Enrich button,
the manual template, and form-lead/booking-triage templates).

## 4. Plan limits + monthly usage

- `PlanLimits` gains `maxEnrichmentsPerMonth: number` (−1 = unlimited).
  Numbers (`plan-limits.ts`): Free **5**, Pro **100**, Business **−1**.
- Usage: `usage.enrichments_count`, scoped to the project owner's `userId`, within
  the current `periodStart` window (mirror the existing form_responses/bookings
  increment + period-reset pattern). Helper on a service (e.g. extend the usage
  helper used for forms/bookings) to: read current count for the period, and
  increment by 1.
- Enforcement: the enrich endpoint rejects with 403 when
  `maxEnrichmentsPerMonth !== -1 && used >= maxEnrichmentsPerMonth`.

## 5. Enrich endpoint + async job

- `POST /api/projects/:projectId/contacts/:contactId/enrich`:
  1. verify the contact belongs to the project (reuse `contactInProject`);
  2. resolve plan + current usage; 403 if quota exhausted;
  3. **increment** the enrichment counter (count at enqueue);
  4. enqueue an enrichment job onto `WORKFLOW_QUEUE`;
  5. return `{ success: true, remaining }`.
- Queue consumer (`worker/index.ts`) gains an enrichment job branch
  (`{ kind: "enrich", projectId, contactId }`): builds the enrichment prompt,
  calls `WorkflowAiResearchService.execute(...)`, then the same metadata write +
  `enrichContactFromResearch` + notes append + `workflow_researched` activity used
  by the step. (Shared code path — no duplicate logic, no pre-existing workflow
  required.)
- `GET /api/projects/:projectId/enrichment-usage` → `{ used, limit, remaining, unlimited }`.

## 6. Workflow template update

In `src/lib/workflow-templates.ts`, rename/update `manual-contact-research` →
**"Research & Enrich Contact"**: description mentions enrichment; the `ai_research`
prompt pulls company, company size, estimated revenue, position, website, LinkedIn;
**remove** the `update_contact`(notes) step (research now appends the summary
itself); keep the team-notify `send_email`. Update `tests/workflow-templates.test.ts`
expectations.

## 7. Validation

`createContactSchema` / `updateContactSchema` (`worker/validation.ts`) gain the six
new fields as optional nullable strings so the UI can edit them and the enrich
path can write them.

## 8. Contact detail UI (`src/pages/ContactDetail.tsx`)

- Render the six fields in the Contact Information card, inline-editable like
  name/email (LinkedIn/website render as links when set).
- **Enrich button** in the page header: label "Enrich" with a sparkle icon.
  - Calls `POST …/enrich`; shows `Enriching…` (disabled, spinner) while the job
    runs; refetches the contact (poll/`invalidateQueries`) so fields + notes fill
    in when done.
  - Reads `…/enrichment-usage`; shows "N of M enriches left this month"; when
    `remaining === 0` and not unlimited, disables with an upgrade hint.

## Testing

- Unit (`bun test`, in-memory drizzle): `enrichContactFromResearch` mapping
  (non-empty-only, role→position, website→companyWebsite); notes-append helper
  (preserves existing, adds dated block); usage increment + period reset;
  quota-exhausted returns 403. Update `workflow-templates.test.ts`.
- Visual (headless Chrome): contact with new fields editable; click Enrich →
  `Enriching…` → fields + notes populate; quota counter decrements; exhausted
  state disables with upgrade hint.

## Out of scope (v1)

- company/position as Table/Kanban columns; CSV-importing the new fields;
  refunding quota when a job fails; de-duplicating repeated summary blocks in notes.
