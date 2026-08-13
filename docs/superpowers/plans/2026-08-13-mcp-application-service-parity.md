# MCP Application-Service Parity Implementation Plan

**Goal:** Expose the 52 missing project-management MCP operations, repair the incomplete existing tools, and make dashboard-session HTTP, API-key HTTP, and MCP call one shared application-service implementation per domain.

**Architecture:** Keep the existing `worker/services/*` classes as persistence/domain primitives. Add transport-neutral application actions in `worker/lib/*-actions.ts` for validation, project ownership, entitlements, persistence, and side effects. `worker/index.ts` and `worker/mcp/tools/*` become thin transport adapters that authenticate, call an action, and serialize the same result for HTTP or MCP.

**Tech Stack:** Bun, TypeScript, Hono, MCP SDK, Drizzle/D1, Cloudflare R2, Zod.

## Global constraints

- Add exactly 52 MCP tool IDs, increasing the canonical inventory from 40 to 92.
- Do not expose the 13 session-only administration operations: project deletion, member management, API-key management, MCP-connection management, or Google OAuth connection lifecycle.
- MCP remains hard-scoped to `ToolContext.projectId()`; no tool accepts `projectId`.
- Every resource ID is checked against the authorized project before reading, changing, deleting, triggering, or returning it. A foreign ID returns `Not found`.
- Shared application actions own Zod parsing, ownership, entitlement checks, persistence, and external side effects. HTTP and MCP adapters must not repeat that logic.
- Dashboard and API-key clients already use the same `/api/projects/:projectId/*` handlers. Refactoring those handlers therefore covers both transports.
- Preserve existing HTTP status codes and response envelopes and preserve existing MCP success payloads unless this plan explicitly expands them.
- Use current centralized schemas from `worker/validation.ts`; add schemas there for currently unvalidated route bodies and query strings.
- Use function declarations for named functions and `import type` for type-only imports.
- Add no dependencies and no database migration.
- Implement first, then update the existing inventory/contract checks and run final verification. Do not create one test per tool.

## Final MCP inventory additions

| Domain | New tool IDs |
| --- | --- |
| Project | `get_project`, `get_project_entitlements`, `update_project` |
| Custom CSS | `get_custom_css`, `set_custom_css`, `delete_custom_css` |
| Project assets | `upload_project_asset`, `delete_project_asset` |
| Event types and calendars | `delete_event_type`, `list_project_calendars`, `get_event_type_calendars`, `update_event_type_calendars` |
| Schedules | `create_schedule`, `update_schedule`, `delete_schedule`, `set_schedule_rules`, `add_schedule_override`, `delete_schedule_override` |
| Bookings | `get_booking_form_response` |
| Forms | `delete_form`, `create_form_step`, `update_form_step`, `delete_form_step`, `reorder_form_steps`, `create_form_field`, `update_form_field`, `delete_form_field`, `reorder_form_fields` |
| Form responses | `get_form_response`, `get_form_response_file`, `delete_form_response` |
| CRM | `list_contact_views`, `create_contact_view`, `update_contact_view`, `delete_contact_view`, `import_contacts`, `set_contact_stage`, `enrich_contact`, `seed_contact_pipeline` |
| Workflows | `create_workflow`, `update_workflow`, `delete_workflow`, `create_workflow_step`, `update_workflow_step`, `delete_workflow_step`, `reorder_workflow_steps`, `list_workflow_runs`, `get_workflow_run`, `trigger_workflow`, `test_workflow` |
| Reporting | `list_recent_activity`, `get_analytics_filters` |

## File map

### Shared application layer

- Create `worker/lib/action-result.ts`: generic success/failure contract used by every new action.
- Create `worker/lib/project-actions.ts`: project read/update, entitlement snapshot, Custom CSS.
- Create `worker/lib/project-asset-actions.ts`: validated R2 image upload/delete and storage accounting.
- Create `worker/lib/event-type-actions.ts`: event-type CRUD orchestration.
- Create `worker/lib/schedule-actions.ts`: schedule CRUD, rules, and overrides.
- Create `worker/lib/form-actions.ts`: forms, steps, fields, responses, and private response files.
- Create `worker/lib/tag-actions.ts`: tag CRUD and contact assignment/removal.
- Create `worker/lib/contact-view-actions.ts`: saved views and pipeline seeding.
- Create `worker/lib/workflow-actions.ts`: workflow CRUD, steps, runs, trigger, and test execution.
- Create `worker/lib/calendar-actions.ts`: project calendar discovery and event-type routing configuration.
- Create `worker/lib/activity-actions.ts`: recent dashboard activity.
- Modify `worker/lib/booking-actions.ts`: add booking reads, availability, and booking-form response actions.
- Modify `worker/lib/contact-actions.ts`: add full contact CRUD, import, stage, enrichment, next action, and activity actions.
- Modify `worker/lib/analytics-actions.ts`: add analytics-filter action.

### Transport adapters and catalog

- Create `worker/mcp/action-result.ts`: convert shared action results into MCP text, structured entitlement errors, and embedded binary resources.
- Create `worker/mcp/tools/projects.ts`, `worker/mcp/tools/project-assets.ts`, `worker/mcp/tools/calendars.ts`, `worker/mcp/tools/contact-views.ts`, and `worker/mcp/tools/activity.ts`.
- Modify every existing file under `worker/mcp/tools/` so handlers delegate to actions.
- Modify `worker/mcp/helpers.ts` so `ToolResult` supports MCP text plus embedded blob resources.
- Modify `worker/mcp/server.ts` to register the new domain modules and update usage examples.
- Modify `shared/mcp-tools.ts` and `scripts/api-docs-catalog.ts` for all 92 tools and their annotations.
- Modify `worker/index.ts` so the corresponding HTTP handlers delegate to the same actions.
- Modify `worker/validation.ts` for shared management-query and mutation schemas.

### Generated contracts and verification

- Modify `tests/mcp-discovery.test.ts`, `tests/mcp-tool-scopes.test.ts`, and `tests/api-docs-analytics.test.ts` for the 92-tool contract.
- Modify `README.md` and regenerate `public/llms.txt`, `public/openapi.json`, and `docs/api-endpoint-audit.md` with `bun run docs:generate`.

---

### Task 1: Establish the application-action contract

**Files:**

- Create: `worker/lib/action-result.ts`
- Create: `worker/mcp/action-result.ts`
- Modify: `worker/mcp/helpers.ts`
- Modify: `worker/validation.ts`

- [ ] Define `ActionResult<T>` as either `{ ok: true; status: 200 | 201; value: T }` or `{ ok: false; status: 400 | 403 | 404 | 409 | 429 | 500 | 502; body: ActionErrorBody; headers?: Record<string, string> }`.
- [ ] Define `ProjectActionDeps` with `db`, `env`, `projectId`, `channel: "rest" | "mcp"`, optional trusted `projectScope`, optional `actorUserId`, and `waitUntil`.
- [ ] Add constructors `actionOk`, `actionCreated`, `actionError`, and `actionNotFound`, plus an entitlement-failure converter that preserves the current structured body and rate-limit headers.
- [ ] Add `actionToMcpResult(result, options)` in `worker/mcp/action-result.ts`. It serializes successful JSON, maps ordinary failures to `isError`, and places plan failures under `structuredContent.entitlementError`.
- [ ] Widen `ToolResult` to the MCP SDK result shape so `get_form_response_file` can return an embedded `BlobResourceContents` block without weakening current text results.
- [ ] Add shared schemas for project management, contact listing, booking listing, schedule overrides, form/workflow reorder bodies, workflow trigger/test bodies, project asset metadata, and paginated form responses.
- [ ] Derive REST query parsing and MCP input shapes from those same schemas instead of maintaining independent validation rules.

**Done when:** A domain action can return one typed result that an HTTP route or MCP tool can serialize without knowing domain rules.

### Task 2: Project settings, entitlements, Custom CSS, and assets

**Files:**

- Create: `worker/lib/project-actions.ts`
- Create: `worker/lib/project-asset-actions.ts`
- Create: `worker/mcp/tools/projects.ts`
- Create: `worker/mcp/tools/project-assets.ts`
- Modify: `worker/index.ts`
- Modify: `worker/services/custom-css-service.ts` only if a project-scoped helper is missing

- [ ] Move project lookup, JSON settings normalization, slug collision checks, slug-history updates, and project updates into `getProjectAction` and `updateProjectAction`.
- [ ] Add `getProjectEntitlementsAction`, passing `actorUserId` only for session callers and returning the same project snapshot for API-key and MCP callers.
- [ ] Add `getCustomCssAction`, `setCustomCssAction`, and `deleteCustomCssAction`; preserve Custom CSS plan enforcement and storage accounting.
- [ ] Add `uploadProjectAssetAction` accepting `{ filename, contentType, sizeBytes, bytes }`. Validate JPEG/PNG/WebP/GIF, the 5 MB limit, a safe extension, project deletion state, workspace storage entitlement, R2 write, and usage commit/release in one place.
- [ ] Add `deleteProjectAssetAction`; require the key prefix `projects/${projectId}/`, delete R2, and decrement workspace storage usage.
- [ ] Have the HTTP multipart route convert `File` to bytes and call the same upload action. Have MCP accept validated base64, decode it once, and call that action.
- [ ] Register the eight project/configuration tools. Mark CSS and asset deletion destructive, project/CSS updates idempotent, and asset upload non-destructive.
- [ ] Replace the existing project, entitlement, Custom CSS, upload, and delete route bodies in `worker/index.ts` with action calls and response serialization.

**Done when:** Renaming a project, changing branding settings, inspecting limits, or storing an image follows identical rules from dashboard, API key, and MCP.

### Task 3: Event types and calendar routing

**Files:**

- Create: `worker/lib/event-type-actions.ts`
- Create: `worker/lib/calendar-actions.ts`
- Create: `worker/mcp/tools/calendars.ts`
- Modify: `worker/mcp/tools/event-types.ts`
- Modify: `worker/index.ts`

- [ ] Implement list/get/create/update/delete event-type actions using `EventTypeService`, `createWithResourceCapacity`, and strict project ownership.
- [ ] Preserve event-type creation behavior: create a default schedule, optionally copy a project-owned source event type's schedule, and reject a foreign `copyFromEventTypeId`.
- [ ] Validate `bookingFormId` against a form in the same project before create/update. Validate all `settings` through the existing event-type schema.
- [ ] Expand `create_event_type` to expose `bookingFormId`, `settings`, and `copyFromEventTypeId`; expand `update_event_type` to expose `bookingFormId` and `settings`.
- [ ] Add `delete_event_type` and preserve associated-schedule cleanup.
- [ ] Implement `listProjectCalendarsAction` using the project workspace owner/team scope, refresh each connection, and preserve per-account graceful provider failures.
- [ ] Implement `getEventTypeCalendarsAction` and `updateEventTypeCalendarsAction`; validate every destination, busy, and invite connection against the project workspace before persisting.
- [ ] Register the four missing event/calendar tools and replace the matching HTTP handlers with action calls.

**Done when:** MCP can completely configure an event type and its calendar delivery/free-busy routing without bypassing HTTP ownership rules.

### Task 4: Schedule management

**Files:**

- Create: `worker/lib/schedule-actions.ts`
- Modify: `worker/mcp/tools/schedules.ts`
- Modify: `worker/index.ts`
- Modify: `worker/validation.ts`

- [ ] Implement `listSchedulesAction` and `getScheduleAction`; keep `get_schedule` returning `{ schedule, rules, overrides }`.
- [ ] Implement create/update/delete actions with `createScheduleSchema` and project ownership.
- [ ] Implement `setScheduleRulesAction` using `updateAvailabilityRulesSchema`; update timezone in the same action when supplied and replace rules atomically from the caller's perspective.
- [ ] Implement add/delete override actions with a new schema that validates `YYYY-MM-DD`, blocked-day semantics, HH:mm ranges, and start-before-end.
- [ ] Register `create_schedule`, `update_schedule`, `delete_schedule`, `set_schedule_rules`, `add_schedule_override`, and `delete_schedule_override` with accurate destructive/idempotent annotations.
- [ ] Replace all schedule HTTP route bodies with action calls.

**Done when:** An MCP client can create working hours, replace weekly availability, and manage date exceptions using the same code as the dashboard.

### Task 5: Booking reads and complete booking input

**Files:**

- Modify: `worker/lib/booking-actions.ts`
- Modify: `worker/mcp/tools/bookings.ts`
- Modify: `worker/index.ts`

- [ ] Add shared actions for list bookings, booking detail, available slots, and booking form-response fields.
- [ ] Make list bookings expire stale pending requests before filtering and pagination, matching the current HTTP route.
- [ ] Make booking detail return `{ booking, eventTypeName, formFields }` for both HTTP and MCP.
- [ ] Expand `create_booking` with `formFields` so required/custom booking questions can be submitted through the already-shared `createBookingAction`. Expose optional `metadata` only if it remains accepted by the centralized booking schema.
- [ ] Register `get_booking_form_response` and make it return the same normalized field labels/types/values as HTTP.
- [ ] Keep cancel/confirm/decline actions as the single lifecycle implementation; simplify both adapters to validation plus action serialization.

**Done when:** MCP supports custom booking forms and receives the same enriched booking details and stale-status handling as dashboard/API callers.

### Task 6: Complete form builder and response management

**Files:**

- Create: `worker/lib/form-actions.ts`
- Modify: `worker/mcp/tools/forms.ts`
- Modify: `worker/index.ts`
- Modify: `worker/services/form-service.ts` only for missing project-scoped queries

- [ ] Implement project-scoped form list/get/create/update/delete actions, including slug uniqueness, form capacity, `settings`, and full-form normalization.
- [ ] Expand `create_form` and `update_form` to expose `settings`.
- [ ] Implement create/update/delete/reorder step actions. Verify the form belongs to the project and the step belongs to that form before mutation.
- [ ] Implement create/update/delete/reorder field actions. Verify the form, step, and composite field ID all belong to the same project/form before mutation.
- [ ] Implement list/get/delete response actions. Add `offset` to `list_form_responses` so callers can retrieve responses beyond the first page instead of slicing permanently at 50.
- [ ] Extract private file lookup from `worker/index.ts` into `getFormResponseFileAction`; verify project, form, response, and field-value ownership before reading R2.
- [ ] Keep HTTP file download streaming the returned R2 object. Have MCP return the file as an embedded base64 blob with a `linkycal://projects/{projectId}/forms/{formId}/responses/{responseId}/files/{valueId}` URI, filename metadata, and stored MIME type.
- [ ] Register all 12 missing form/form-response tools and replace matching HTTP handlers with action calls.

**Done when:** MCP can construct and publish a full conditional multi-step form, inspect any response page, retrieve private uploads, and delete forms/responses through shared code.

### Task 7: Contacts, tags, saved views, pipeline, and enrichment

**Files:**

- Modify: `worker/lib/contact-actions.ts`
- Create: `worker/lib/tag-actions.ts`
- Create: `worker/lib/contact-view-actions.ts`
- Modify: `worker/mcp/tools/contacts.ts`
- Create: `worker/mcp/tools/contact-views.ts`
- Modify: `worker/index.ts`

- [ ] Move contact list parsing into a shared schema and action supporting search, tag IDs/all-tags, stage inclusion/exclusion, activity filters, booking status, next-action sorting, `limit`, and `offset`.
- [ ] Move get/create/update/delete, dedupe, capacity, workflow dispatch, next-action, and activity behavior into contact actions.
- [ ] Expand `create_contact` and `update_contact` to expose `metadata`, company, company website, position, company size, estimated revenue, and LinkedIn URL.
- [ ] Make `get_contact_activity` use `ContactActivityService` with category, cursor, and limit so MCP matches the current HTTP activity timeline.
- [ ] Move tag list/get/create/update/delete and assignment/removal to `tag-actions.ts`; expose tag search/cursor pagination while retaining `list_contact_tags` compatibility.
- [ ] Move CSV-row import normalization, validation, deduplication, capacity enforcement, result counts, and bounded row errors into `importContactsAction` so HTTP and MCP accept the same structured `{ mapping, rows }` payload.
- [ ] Add `setContactStageAction`, validating the target tag as a pipeline stage in the same project.
- [ ] Add `enrichContactAction`, preserving usage reservation/consume/release, provider error mapping, and refreshed-contact return.
- [ ] Add saved-view CRUD and pipeline-seed actions.
- [ ] Register the eight missing CRM tools and migrate every matching route to the shared actions.

**Done when:** MCP has full CRM/pipeline capability and no contact, tag, view, import, or enrichment business rule remains duplicated in `worker/index.ts` and MCP handlers.

### Task 8: Workflow authoring, execution, and run inspection

**Files:**

- Create: `worker/lib/workflow-actions.ts`
- Modify: `worker/mcp/tools/workflows.ts`
- Modify: `worker/index.ts`
- Modify: `worker/services/workflow-service.ts` only for missing project-scoped queries

- [ ] Implement list/get/create/update/delete workflow actions with project ownership and workflow-capacity enforcement.
- [ ] Implement create/update/delete/reorder step actions; verify the workflow and every step ID before mutation.
- [ ] Implement list/get run actions using `getRunInProject` and bounded limits.
- [ ] Extract manual/scheduled trigger orchestration from `worker/index.ts` into `triggerWorkflowAction`, including active/status checks, contact filtering, contact ownership, no-step/no-match failures, and dispatch count.
- [ ] Extract test-run orchestration into `testWorkflowAction`, including required `contactId`, required `tagId` for tag triggers, contact/form metadata hydration, and queue dispatch.
- [ ] Register all 11 missing workflow tools. Mark `trigger_workflow` and `test_workflow` as open-world writes because steps can email, call webhooks, perform AI research, or mutate contacts.
- [ ] Replace workflow and workflow-step/run HTTP bodies with action calls.

**Done when:** MCP can author, activate, run, test, and diagnose workflows through exactly the same execution path as dashboard/API clients.

### Task 9: Activity and analytics filters

**Files:**

- Create: `worker/lib/activity-actions.ts`
- Create: `worker/mcp/tools/activity.ts`
- Modify: `worker/lib/analytics-actions.ts`
- Modify: `worker/mcp/tools/analytics.ts`
- Modify: `worker/index.ts`

- [ ] Extract the recent booking/form-response aggregation and ordering from `worker/index.ts` into `listRecentActivityAction`, including pending-booking expiration and the current response shape.
- [ ] Register `list_recent_activity` with a bounded limit.
- [ ] Add `getAnalyticsFiltersAction` alongside the existing shared analytics actions, preserving retention and Pro/Business enforcement.
- [ ] Register `get_analytics_filters` and make its inputs use the same period/date validation as HTTP.
- [ ] Replace the matching HTTP handlers with action calls.

**Done when:** MCP can discover valid analytics filters and reproduce the dashboard's recent activity feed without separate query logic.

### Task 10: Canonical tool catalog, scopes, and discovery

**Files:**

- Modify: `shared/mcp-tools.ts`
- Modify: `scripts/api-docs-catalog.ts`
- Modify: `worker/mcp/server.ts`
- Modify: `tests/mcp-discovery.test.ts`
- Modify: `tests/mcp-tool-scopes.test.ts`

- [ ] Add all 52 names to `MCP_TOOL_SCOPES`, assigning reads to `read` and mutations/external actions to `write`.
- [ ] Add domain/title metadata and explicit annotation overrides. Creation tools are non-destructive; replacement/deletion tools are destructive; deterministic PUT-style updates are idempotent; booking/workflow/enrichment actions that reach external systems are open-world.
- [ ] Add each tool exactly once to the read/write groups in `MCP_TOOL_GROUPS`; ensure the computed count is 92.
- [ ] Register the new tool modules in `createLinkyCalMcpServer`.
- [ ] Update server instructions with workflows for schedule editing, form construction, workflow execution, and calendar routing.
- [ ] Update the existing discovery and scope contract tables to the 92-tool inventory and annotation expectations.

**Done when:** MCP `tools/list`, OAuth scope enforcement, generated docs, and server instructions all derive from the same 92-tool catalog.

### Task 11: Remove transport duplication and audit security

**Files:**

- Modify: `worker/index.ts`
- Modify: all `worker/mcp/tools/*.ts` touched above
- Modify: `worker/mcp/helpers.ts`

- [ ] For every tool-backed operation, verify `worker/index.ts` contains only request/query decoding, trusted context construction, one application-action call, header propagation, and HTTP serialization.
- [ ] Verify every MCP handler contains only MCP input declaration, one application-action call, and MCP serialization.
- [ ] Remove superseded helper blocks from `worker/index.ts`, including private form-file lookup, contact-import normalization, workflow trigger/test orchestration, project upload accounting, and calendar-routing persistence.
- [ ] Ensure reads never mutate data. In particular, preserve the current behavior where reading an event type with no schedule does not create one.
- [ ] Audit every child-resource action for both parent and child ownership; do not rely on unscoped `getById` calls.
- [ ] Audit destructive annotations and make error messages return `Not found` for foreign resources without leaking their existence.

**Done when:** Search results show no second implementation of any tool-backed domain operation in a transport adapter.

### Task 12: Documentation and final verification

**Files:**

- Modify: `README.md`
- Modify: `tests/api-docs-analytics.test.ts`
- Regenerate: `public/llms.txt`
- Regenerate: `public/openapi.json`
- Regenerate: `docs/api-endpoint-audit.md`

- [ ] Change hard-coded public/test references from 40 to 92 tools and rename the analytics documentation test so its name no longer says “forty”.
- [ ] Run `bun run docs:generate` and inspect the MCP read/write/domain inventory in `public/llms.txt`.
- [ ] Run the focused MCP contracts: `bun test tests/mcp-discovery.test.ts tests/mcp-tool-scopes.test.ts tests/mcp-readonly-tools.test.ts tests/analytics-mcp.test.ts`.
- [ ] Run the affected product journeys: `bun test tests/critical/availability-timezones.test.ts tests/critical/booking-delivery.test.ts tests/critical/form-experience.test.tsx tests/critical/contact-pipeline.test.ts tests/critical/workflow-journeys.test.ts tests/critical/dashboard-activity.test.ts tests/critical/entitlement-conversion-safety.test.ts`.
- [ ] Run `bun run test`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run docs:check`.
- [ ] Run `bun run build`.
- [ ] Review `git diff --check`, the final tool count, and the generated-file diff before handoff.

**Done when:** The existing user-outcome suite, lint, generated-doc check, and production build pass with a 92-tool MCP inventory.

## Delivery sequence

Implement Tasks 1–10 in order. Task 11 is the consolidation/security pass after all transports have moved to actions. Task 12 is the only verification gate; failures are fixed in the owning domain before rerunning the final commands.
