# Detailed Funnel Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship privacy-safe, unique-journey drop-off analytics for every booking and rendered form stage, expose the aggregate contract through the dashboard, public REST API, and MCP, and add Pro-gated GA4, Meta Pixel, and PostHog forwarding without changing booking or focused-form persistence behavior.

**Architecture:** A shared TypeScript contract defines canonical funnel events and safe context. Browser surfaces use one best-effort dispatcher and resource-scoped anonymous journey ID; widgets hand that ID and `source=widget` into the iframe. The Worker validates and writes additive Cloudflare Analytics Engine columns, records authoritative persistence/success events, and queries aggregate unique-journey reports through one analytics service shared by REST and MCP. Provider configuration is validated and merged into the existing project settings JSON; entitled public pages receive only enabled public identifiers. No behavioral D1 table or analytics migration is introduced.

**Tech Stack:** Bun, TypeScript, React 19, Hono, Cloudflare Workers Analytics Engine, D1/Drizzle, Zod, TanStack Query, Recharts, MCP SDK, Testing Library, Bun test.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-07-29-detailed-funnel-analytics-design.md`; do not add individual visitor histories, raw form answers, session replay, raw JavaScript, GTM, arbitrary provider hosts, or historical backfill.
- Preserve blobs 1–13 and all existing canonical event names and aggregate response fields. Detailed data begins only after deployment.
- Count detailed stages by distinct non-empty journey IDs. Never return journey IDs, IP addresses, contact fields, answers, uploaded filenames, notes, raw error text, or individual paths from reporting APIs.
- Keep `FormExperience.onCheckpoint` as the only persistence/navigation authority. Analytics callbacks are synchronous observers that internally isolate their own errors; they never gate, await, replace, or alter checkpoints.
- Keep booking creation, form start/checkpoint/completion, uploads, notifications, workflows, and calendar delivery functional when LinkyCal telemetry or any external provider fails.
- Use project-scoped entitlement checks on the server. Free projects may retain stored provider settings but cannot mutate them or receive them in public configuration.
- Use local provider icon components/assets. Follow the repository button, toggle-row, spacing, and no-content-divider conventions.
- Follow strict TDD for each behavioral change: add the named regression test, run it and capture the expected failure, make the minimum production change, rerun it green, then refactor.
- Tests assert observable contracts with literal fixtures. Mock only Analytics Engine SQL HTTP, browser provider globals/network, and other external boundaries; do not assert on mock-only UI or source text.
- Run `bun`, never npm/yarn. Use function declarations for named functions and React components.
- Do not apply D1 migrations or deploy while implementing this plan. Deployment requires a separate explicit user request after the release gate passes.

---

## Task 1: Establish the canonical event, query, and report contracts

**Files:**

- Create: `shared/funnel-analytics.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/services/analytics-service.ts`
- Create: `tests/analytics-event-contract.test.ts`

**Contract to add:**

```ts
export type AnalyticsSource = "direct" | "widget";
export type AnalyticsDeviceType = "mobile" | "tablet" | "desktop";
export type FunnelType = "booking" | "form";
export type FunnelStageKind = "page" | "date" | "availability" | "time" |
  "details" | "statement" | "question" | "group" | "step" | "submit" |
  "completion";
export type AnalyticsFailureCategory = "validation" | "slot_unavailable" |
  "rate_limited" | "network" | "server" | "unknown";

export interface FunnelEventContext {
  selectedDate?: string;
  weekday?: string;
  viewerTimezone?: string;
  offeredSlotStarts?: string[];
  earliestSlot?: string;
  latestSlot?: string;
  availabilityOutcome?: "available" | "none" | "error";
  selectedTime?: string;
  fieldType?: string;
  required?: boolean;
  stageOutcome?: "viewed" | "completed" | "skipped" | "validation_failed";
  failureCategory?: AnalyticsFailureCategory;
}

export interface CanonicalFunnelEvent {
  event: AnalyticsEventName;
  projectSlug: string;
  resourceSlug?: string;
  journeyId?: string;
  funnelType?: FunnelType;
  stageKey?: string;
  stageLabel?: string;
  stageKind?: FunnelStageKind;
  stageOrder?: number;
  primaryValue?: string;
  deviceType?: AnalyticsDeviceType;
  source?: AnalyticsSource;
  slotCount?: number;
  daysAhead?: number;
  durationMinutes?: number;
  context?: FunnelEventContext;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  params?: Record<string, string>;
}

export interface FunnelStageReport {
  key: string;
  label: string;
  kind: string;
  order: number;
  visitors: number;
  continued: number;
  continuationRate: number;
  dropOffs: number;
  dropOffRate: number;
  skipped?: number;
  contextBreakdowns?: FunnelContextBreakdowns;
}

export interface FunnelContextBreakdowns {
  selectedDates?: Array<{ value: string; visitors: number }>;
  availabilityOutcomes?: Array<{ value: "available" | "none" | "error";
    visitors: number }>;
  offeredTimes?: Array<{ value: string; visitors: number }>;
  selectedTimes?: Array<{ value: string; visitors: number }>;
  validationFailures?: Array<{ value: string; visitors: number }>;
  submitFailures?: Array<{ value: AnalyticsFailureCategory; visitors: number }>;
}
```

- [ ] Add a table-driven test that accepts every approved existing/detailed event and rejects unknown event names, malformed journey/stage IDs, unsupported context keys, invalid dates/times, more than 48 offered slots, oversized labels/params, arbitrary metadata, and all PII-shaped top-level keys.
- [ ] Run `bun test tests/analytics-event-contract.test.ts` and verify RED because the shared contract and detailed schema do not exist.
- [ ] Add immutable event-name/stage-order constants and the interfaces above to `shared/funnel-analytics.ts`. Keep this file runtime-light so Worker, SPA, and widget bundles can import it.
- [ ] Replace the narrow `trackEventSchema` with a strict canonical event schema. Accept either one event or `{ events: CanonicalFunnelEvent[] }`, cap a batch at 20 events, cap string/array/context sizes, and preserve the existing single-event body.
- [ ] Add `source` and `deviceType` to `analyticsQuerySchema`; require `start` and `end` only for `period=custom`, validate `start <= end`, and reject custom dates with non-custom periods.
- [ ] Extend `AnalyticsEvent` and `writeAnalyticsEvent` without changing blobs 1–13: write journey/funnel/stage/label/kind/primary/device to blobs 14–20 and order/slot count/days ahead/duration to doubles 2–5; keep `double1 = 1`.
- [ ] Serialize a backward-compatible blob-13 envelope that preserves bounded existing `params` separately from the allowlisted bounded `context`; do not merge arbitrary params into detailed context.
- [ ] Rerun `bun test tests/analytics-event-contract.test.ts` and verify GREEN.
- [ ] Run `bun run build` to prove the shared contract compiles in app and Worker projects.
- [ ] Commit with `git commit -m "feat: define detailed analytics event contract"`.

## Task 2: Add provider settings as one validated, entitlement-aware service

**Files:**

- Create: `worker/services/analytics-integration-service.ts`
- Modify: `shared/funnel-analytics.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/index.ts`
- Modify: `worker/lib/public-event-type-actions.ts`
- Modify: `worker/lib/public-form-actions.ts`
- Create: `tests/analytics-integrations.test.ts`
- Modify: `tests/critical/form-experience.test.tsx`
- Modify: `tests/critical/public-booking-timezones.test.tsx`

**Settings shape:**

```ts
export interface AnalyticsIntegrations {
  ga4: { enabled: boolean; measurementId?: string };
  meta_pixel: { enabled: boolean; pixelId?: string };
  posthog: {
    enabled: boolean;
    projectKey?: string;
    host?: "us" | "eu";
  };
}
```

- [ ] Write service tests using the real test D1 database that prove: a provider update preserves `theme` and the other two integrations; invalid GA4/Meta/PostHog identifiers and arbitrary PostHog hosts are rejected; disabling retains the identifier; missing projects return not found.
- [ ] Add a generic-project-update regression test proving `PUT /api/projects/:projectId` cannot create, replace, or delete the reserved `analyticsIntegrations` subtree, including on a Free project; the dedicated integration route is its only mutation path.
- [ ] Add entitlement/publication tests proving Free settings are not returned from public event/form loaders, while Pro and Business loaders return enabled public identifiers only.
- [ ] Run `bun test tests/analytics-integrations.test.ts tests/critical/form-experience.test.tsx tests/critical/public-booking-timezones.test.tsx` and verify RED.
- [ ] Add the normalized integration interfaces to `shared/funnel-analytics.ts` and add discriminated `configureAnalyticsIntegrationSchema` validation for `ga4`, `meta_pixel`, and `posthog`. Reject unknown keys, raw-script fields, URLs, and missing identifiers when enabling.
- [ ] Implement `AnalyticsIntegrationService` with `list(projectId)`, `configure(projectId, input)`, and `getPublished(projectId)` methods. Parse malformed/empty project settings defensively, normalize all three provider slots, and merge only `settings.analyticsIntegrations`.
- [ ] Reserve `analyticsIntegrations` in the generic project PUT handler: merge ordinary settings while always restoring the currently persisted integration subtree before saving.
- [ ] Resolve entitlements inside `getPublished`; return an empty provider list when `planLimits.analytics` is false. Do not delete stored settings on downgrade.
- [ ] Change both public loader actions to return a sibling `analyticsIntegrations` field sourced from `getPublished`; do not expose the entire integration settings subtree through `project.settings`.
- [ ] Add/adjust public-loader fixtures so their project/subscription structures mirror production rows.
- [ ] Rerun the focused tests and verify GREEN.
- [ ] Run `bun run test:critical` to confirm public booking/form payload changes do not alter behavior.
- [ ] Commit with `git commit -m "feat: add gated analytics integrations service"`.

## Task 3: Build one browser dispatcher, provider adapters, and widget handoff

**Files:**

- Create: `src/lib/funnel-analytics.ts`
- Create: `src/lib/analytics-providers.ts`
- Modify: `src/lib/track.ts`
- Modify: `widget/shared/api.ts`
- Modify: `widget/booking/index.ts`
- Modify: `widget/form/index.ts`
- Create: `tests/funnel-analytics-client.test.ts`
- Create: `tests/analytics-providers.test.ts`

**Browser API:**

```ts
export interface FunnelAnalyticsDispatcher {
  readonly journeyId: string;
  emit(event: Omit<CanonicalFunnelEvent, "journeyId" | "source" |
    "deviceType">): void;
}

export function createFunnelAnalyticsDispatcher(input: {
  projectSlug: string;
  resourceSlug: string;
  funnelType: FunnelType;
  integrations?: AnalyticsIntegrations;
  search?: string;
  referrer?: string;
}): FunnelAnalyticsDispatcher;
```

- [ ] Write a literal-fixture test proving one resource-scoped journey ID is reused, view/completion events dedupe by `journeyId + event + stageKey`, failure events may repeat, device/source/UTM/referrer are attached, and a throwing `sendBeacon`/fetch never escapes `emit`.
- [ ] Write provider tests proving canonical safe fields map to GA4 namespaced events, Meta custom events plus `Schedule`/`Lead`, and PostHog canonical names; prove labels, names, emails, answers, notes, filenames, and raw errors never leave the adapter.
- [ ] Add widget tests proving each iframe URL includes `lc_source=widget` and `lc_journey=<id>`, forwards host UTM/prefill values, and the host loader no longer sends `widget_view`.
- [ ] Run the three new test files and verify RED.
- [ ] Implement resource-scoped journey creation using `sessionStorage` when available and an in-memory fallback. Accept only a validated `lc_journey` from the iframe URL; otherwise generate `crypto.randomUUID()`.
- [ ] Detect `mobile|tablet|desktop` from viewport and coarse-pointer/user-agent signals through an injectable helper so tests use literal inputs.
- [ ] Make `src/lib/track.ts` a compatibility wrapper around the dispatcher; remove hardcoded direct attribution from the low-level send path.
- [ ] Implement provider loading once per public page, with vendor script URLs fixed in code: Google tag, Meta Pixel, and `us|eu` PostHog hosts only. Isolate initialization and capture per provider; use no retry loop. Use a named PostHog instance so customer analytics cannot replace LinkyCal's internal PostHog client.
- [ ] Sanitize external payloads through an explicit allowlist before provider mapping. Never pass `stageLabel` externally.
- [ ] Update widgets to generate the journey ID before iframe creation, append `lc_source`/`lc_journey`, and remove outer `widget_view` delivery. The iframe becomes the single funnel emitter.
- [ ] Rerun the three test files and verify GREEN.
- [ ] Run `bun run widget:build` and inspect both bundles for successful output.
- [ ] Commit with `git commit -m "feat: unify browser funnel analytics delivery"`.

## Task 4: Instrument actual form screens without changing checkpoint persistence

**Files:**

- Modify: `src/components/FormExperience.tsx`
- Modify: `src/lib/form-experience.ts`
- Modify: `src/pages/PublicForm.tsx`
- Modify: `worker/validation.ts`
- Modify: `worker/lib/public-form-actions.ts`
- Modify: `worker/index.ts`
- Modify: `tests/critical/form-experience.test.tsx`

**Observer API:**

```ts
export interface FormExperienceAnalyticsEvent {
  type: "viewed" | "completed" | "skipped" | "validation_failed";
  screen: {
    key: string;
    label: string;
    kind: "statement" | "question" | "group" | "step";
    order: number;
    fieldType?: string;
    required?: boolean;
  };
  failureCategory?: "validation";
}

onAnalyticsEvent?: (event: FormExperienceAnalyticsEvent) => void;
```

- [ ] Extend the existing focused-form critical test with an analytics capture that proves every rendered statement/question/group is viewed once, a valid advance emits completed, conditional removals emit skipped, and no event contains entered values.
- [ ] Add a regression test where the analytics callback throws: each existing PATCH body still contains the expected step fields, intermediate responses remain `in_progress`, and only the final checkpoint becomes `completed`.
- [ ] Add a classic-form case proving configured visible steps—not individual fields—form the stage list.
- [ ] Run `bun test tests/critical/form-experience.test.tsx` and verify the new assertions RED while existing checkpoint tests remain GREEN.
- [ ] Add a pure `getFormAnalyticsScreen`/label helper to `src/lib/form-experience.ts`: use stable model keys, one-based rendered order, field type/required metadata, and bounded display-label snapshots; do not include values.
- [ ] Add optional `onAnalyticsEvent` to `FormExperience`. Emit viewed from a screen-entry effect, validation failure before returning false, completed only after validation and (when required) a successful checkpoint, and skipped when model recomputation bypasses previously reachable screens.
- [ ] Wrap observer calls in a local fire-and-forget error boundary. Do not `await` the observer and do not change the existing `checkpoint()` or `goNext()` return paths.
- [ ] Initialize the standalone form dispatcher from `analyticsIntegrations`, emit `form_view`, screen lifecycle, `form_submit_attempted`, and safe `form_submit_failed`; pass only correlation metadata with response start/PATCH bodies.
- [ ] Extend response-start and step schemas with optional `analytics: { journeyId, source, deviceType, stageKey, stageOrder }`. Keep it separate from `metadata` and persisted form answers.
- [ ] After a real response is created, write server-authoritative `form_started` with correlation. After each real PATCH succeeds, write the persisted stage-completion event; write `form_completed` only after the final response is actually completed. Keep spam fake-success branches analytics-free.
- [ ] Factor shared server tracking for both `/api/public/forms/...` and `/api/v1/forms/...` routes so they cannot diverge.
- [ ] Rerun `bun test tests/critical/form-experience.test.tsx` and verify GREEN, including uploads and checkpoint bodies.
- [ ] Run `bun run test:critical`.
- [ ] Commit with `git commit -m "feat: track rendered form funnel stages"`.

## Task 5: Instrument booking selection, availability, attached forms, and success correlation

**Files:**

- Modify: `src/pages/PublicBooking.tsx`
- Modify: `worker/validation.ts`
- Modify: `worker/index.ts`
- Modify: `worker/lib/booking-actions.ts`
- Create: `tests/critical/public-booking-analytics.test.tsx`
- Modify: `tests/critical/booking-delivery.test.ts`
- Modify: `tests/critical/public-booking-timezones.test.tsx`

- [ ] Add a browser test that selects a literal date and slot and asserts this exact ordered journey: `page_view`, `booking_date_selected`, `booking_availability_shown`, `booking_time_selected`, `booking_details_viewed`, attached-form screen events, `booking_submit_attempted`; each stage emits once.
- [ ] Assert the availability event contains selected local date, weekday, days ahead, viewer timezone, duration, literal offered local starts, earliest/latest, slot count, and `available|none|error`; selected-time includes only scheduling metadata.
- [ ] Add failure cases for validation, 409 slot unavailable, 429 rate limit, network rejection, and 500 server response; assert bounded categories only and prove booking UI remains usable.
- [ ] Extend booking delivery tests to prove `booking_created` is written only after the real action succeeds, uses the client journey/source/device correlation, and is absent on honeypot fake-success and failed booking paths.
- [ ] Run the focused booking tests and verify RED.
- [ ] Initialize one booking dispatcher from public `analyticsIntegrations`. Replace the old page-view call and instrument date selection, successful/empty/error availability results, slot selection, details entry, submission attempts, and safe failures.
- [ ] Pass the same `onAnalyticsEvent` observer into attached `FormExperience`, but map its stages into the booking funnel between Details and Submit with deterministic orders.
- [ ] Extend `createBookingSchema` with an optional strict analytics correlation object; do not pass it into booking/contact fields or workflow data.
- [ ] After `createBookingAction` returns a real success, write authoritative `booking_created` using correlation and safe geo fields. Preserve old-client behavior when analytics metadata is absent.
- [ ] Keep event emission outside availability/query and booking mutation control flow; telemetry errors must be swallowed.
- [ ] Rerun focused booking tests and verify GREEN.
- [ ] Run `bun run test:critical`.
- [ ] Commit with `git commit -m "feat: track detailed booking funnel stages"`.

## Task 6: Query unique-journey funnels and safe context breakdowns

**Files:**

- Modify: `worker/services/analytics-service.ts`
- Create: `worker/lib/analytics-actions.ts`
- Create: `tests/analytics-reporting.test.ts`

**Report additions:**

```ts
export interface DetailedFunnelReport {
  availableSince: string | null;
  stages: FunnelStageReport[];
  bySource: Array<{ source: AnalyticsSource; visitors: number }>;
  byDevice: Array<{ deviceType: AnalyticsDeviceType; visitors: number }>;
  failures: Array<{ category: AnalyticsFailureCategory; count: number }>;
}
```

- [ ] Write a reporting test whose mocked Analytics Engine boundary receives literal rows for repeated events, two distinct journeys, a conditional skip, pre-revamp rows with empty blob 14, and safe booking context.
- [ ] Assert literal visitors/continued/drop-off/rates, skip handling, date/availability/offered-time/selected-time distributions, safe failures, and the earliest detailed timestamp. Assert existing high-level totals/time series are unchanged.
- [ ] Add a project-resource boundary test: a selected event type/form not owned by the project returns the same empty detailed report as a missing resource and does not query another project.
- [ ] Add query-filter tests for source/device/custom range and response serialization tests that prove no blob 14/journey field appears.
- [ ] Run `bun test tests/analytics-reporting.test.ts` and verify RED.
- [ ] Centralize period/filter SQL fragments with bound, escaped literals; retain current sampled high-level totals and add detailed queries over non-empty blob 14.
- [ ] Calculate stage visitors as distinct journey IDs. Calculate `continued` against the next actual ordered stage; treat explicit conditional skips as continuations rather than drop-offs.
- [ ] Add framework-independent reporting actions that receive `{ db, env, projectId, planLimits }`, resolve stable resource ID/slug ownership with D1, and then call Analytics Engine query functions. All-resource requests keep existing summaries and omit resource-specific stage rows.
- [ ] Make the filters action combine observed UTM/source/device values from Analytics Engine with project-owned event-type and form `{ id, slug, name }` catalogs from D1.
- [ ] Parse bounded blob-13 context defensively and aggregate only the approved keys. Ignore malformed historical context instead of failing the response.
- [ ] Add `availableSince`, detailed funnel, source/device, booking distributions, and failure arrays to existing return values without renaming/removing current fields.
- [ ] Rerun `bun test tests/analytics-reporting.test.ts` and verify GREEN.
- [ ] Run `bun run build`.
- [ ] Commit with `git commit -m "feat: report unique-journey funnel drop-offs"`.

## Task 7: Expose REST reporting and integration management consistently

**Files:**

- Modify: `worker/index.ts`
- Modify: `worker/lib/api-route-policy.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/lib/analytics-actions.ts`
- Create: `tests/analytics-rest-api.test.ts`

- [ ] Add route-level tests using session and project-scoped API-key requests for all four existing analytics GET routes plus integration GET/PUT. Assert identical aggregate bodies for session/API key and 403 for Free analytics.
- [ ] Add cross-project tests proving API keys cannot read reports or configure providers outside their project and unknown resource slugs return the empty detailed shape without existence disclosure.
- [ ] Add anonymous tracking tests for one event and a 20-event batch, per-IP rate limiting, silent 204 on malformed/oversized input, strict safe-context persistence, and no write for unknown projects.
- [ ] Run `bun test tests/analytics-rest-api.test.ts` and verify RED.
- [ ] Extend the framework-independent analytics actions to cover integration list/configure, validate entitlements consistently, and return route-neutral success/error results. REST and MCP call these actions.
- [ ] Add `GET /api/projects/:projectId/analytics/integrations` and `PUT /api/projects/:projectId/analytics/integrations/:provider`; return normalized configs and the same 403 message used by reporting.
- [ ] Add both integration routes to `PROJECT_API_KEY_ROUTES`. Do not make them dashboard-session-only.
- [ ] Route all analytics queries through `analyticsQuerySchema`; include `source` and `deviceType`, and return 400 for invalid period/range combinations.
- [ ] Add an explicit `checkRateLimit("analytics:<ip>", 120, 60_000)` before parsing `/api/v1/t`; validate/iterate at most 20 events and keep its response silent 204.
- [ ] Rerun `bun test tests/analytics-rest-api.test.ts` and verify GREEN.
- [ ] Run `bun run docs:check` once and record the expected RED stale-artifact failure for the new routes; Task 11 will update generated docs.
- [ ] Commit runtime and tests with `git commit -m "feat: expose detailed analytics REST API"`.

## Task 8: Add five project-scoped MCP analytics tools

**Files:**

- Create: `worker/mcp/tools/analytics.ts`
- Modify: `worker/mcp/agent.ts`
- Create: `tests/analytics-mcp.test.ts`

- [ ] Write handler tests for `get_analytics_overview`, `get_booking_funnel_analytics`, `get_form_funnel_analytics`, `list_analytics_integrations`, and `configure_analytics_integration` using the real test D1 project boundary and a stubbed Analytics Engine HTTP boundary.
- [ ] Prove event-type/form IDs are resolved within `ToolContext.projectId()`, cross-project IDs return `Not found`, Free projects cannot read/configure analytics, and the configure tool rejects the same bad identifiers/host/raw fields as REST.
- [ ] Assert MCP report payloads equal the corresponding analytics action output and contain no journey IDs, IP/contact/form values, labels sent to providers, or raw errors.
- [ ] Run `bun test tests/analytics-mcp.test.ts` and verify RED.
- [ ] Export one handler function per tool from `worker/mcp/tools/analytics.ts`; call `worker/lib/analytics-actions.ts` rather than embedding SQL or settings writes.
- [ ] Register the five tools with strict Zod input schemas. MCP inputs use optional project-owned `eventTypeId`/`formId`; never accept `projectId`.
- [ ] Add `registerAnalyticsTools(this.server, ctx)` to `worker/mcp/agent.ts`.
- [ ] Rerun `bun test tests/analytics-mcp.test.ts` and verify GREEN.
- [ ] Run `bun run build`.
- [ ] Commit with `git commit -m "feat: expose funnel analytics over MCP"`.

## Task 9: Upgrade the Analytics dashboard to exact stage drop-off analysis

**Files:**

- Create: `src/components/analytics/DetailedFunnel.tsx`
- Create: `src/components/analytics/AnalyticsBreakdownCard.tsx`
- Modify: `src/pages/Analytics.tsx`
- Create: `tests/analytics-dashboard.test.tsx`

- [ ] Write component tests with literal REST fixtures proving a selected event type displays all static and attached-form stages, visitors, continuation, drop-offs, and booking context cards; a selected form displays rendered stages, skips, and safe validation failures.
- [ ] Add filter tests proving event-type/form selectors, direct/widget source, and mobile/tablet/desktop device choices alter the request query and “All resources” retains the high-level summary.
- [ ] Add historical-boundary and empty-state tests: the UI displays “Detailed step tracking began …” from `availableSince` and does not describe missing pre-boundary rows as zero traffic.
- [ ] Run `bun test tests/analytics-dashboard.test.tsx` and verify RED.
- [ ] Move detailed stage typing to the shared contract and implement `DetailedFunnel` with one icon-bearing row per stage, tabular counts, continuation percentage, drop-off count, and previous-stage drop-off percentage.
- [ ] Implement small context cards for selected dates, no availability, offered times, selected times, skips/validation, and safe submit failures. Use spacing, cards, and chart primitives—not content-divider borders.
- [ ] Extend `FilterOptions` with `{ eventTypes, forms, sources, deviceTypes }`; add resource selectors within Booking/Form tabs and source/device selectors beside existing UTM filters.
- [ ] Add a Custom period option with explicit start/end date controls; omit both dates for 7/30/90 requests and send both only when Custom is selected.
- [ ] Preserve the current locked Analytics page for Free users and the icon-plus-text Upgrade action.
- [ ] Rerun `bun test tests/analytics-dashboard.test.tsx` and verify GREEN.
- [ ] Run `bun run lint` and `bun run build`.
- [ ] Commit with `git commit -m "feat: show exact analytics funnel drop-offs"`.

## Task 10: Add Pro-gated integration cards with bundled brand icons

**Files:**

- Create: `src/components/icons/GoogleAnalyticsIcon.tsx`
- Create: `src/components/icons/MetaPixelIcon.tsx`
- Create: `src/components/icons/PostHogIcon.tsx`
- Create: `src/components/analytics/AnalyticsIntegrationCard.tsx`
- Modify: `src/pages/Settings.tsx`
- Create: `tests/analytics-settings.test.tsx`

- [ ] Write UI tests proving GA4, Meta Pixel, and PostHog cards render with local brand icons, normalized saved values, host selection, enabled card-style toggles, and icon-plus-text Save actions.
- [ ] Prove a Free project sees locked cards and an icon-plus-text Upgrade action, cannot send a PUT, and a backend 403 is surfaced if entitlement changes after page load.
- [ ] Prove saving one provider uses its dedicated integration route and does not send theme/other project settings.
- [ ] Run `bun test tests/analytics-settings.test.tsx` and verify RED.
- [ ] Add compact local SVG React icon components with accessible hidden names; do not fetch remote artwork.
- [ ] Add an **Analytics integrations** section to Project Settings. Fetch the integration collection route independently of general project/theme state.
- [ ] Render each enabled toggle in `rounded-[16px] bg-muted/50 px-4 py-3` with title/description left and switch right. Use provider-specific public identifier inputs and a US/EU PostHog select.
- [ ] Use Save/Loader icon replacement exactly as repository conventions require. Keep Cancel/Close exceptions unchanged.
- [ ] Gate controls from entitlements and retain server error handling as the authority.
- [ ] Rerun `bun test tests/analytics-settings.test.tsx` and verify GREEN.
- [ ] Run `bun run lint` and `bun run build`.
- [ ] Commit with `git commit -m "feat: add analytics provider settings UI"`.

## Task 11: Make REST, MCP, OpenAPI, audit, and llms.txt documentation one checked contract

**Files:**

- Modify: `scripts/api-docs-catalog.ts`
- Modify: `scripts/generate-api-docs.ts`
- Create: `scripts/llms-template.ts`
- Modify: `src/lib/api-reference.ts`
- Modify: `src/pages/Docs.tsx`
- Modify: `README.md`
- Generate: `public/openapi.json`
- Generate: `docs/api-endpoint-audit.md`
- Generate: `public/llms.txt`
- Create: `tests/api-docs-analytics.test.ts`

- [ ] Write generator tests that call exported generation functions and assert the four analytics GET routes, two integration routes, anonymous tracking schema, all filters/report fields, five MCP tools, and the computed MCP tool count appear in the generated artifacts.
- [ ] Add drift tests proving `--check` fails when a generated artifact differs and that the endpoint audit classifies both integration routes as session-or-API-key. Assert rendered artifact behavior, not source strings.
- [ ] Run `bun test tests/api-docs-analytics.test.ts` and verify RED.
- [ ] Add explicit analytics request/response schemas and query parameters to `scripts/api-docs-catalog.ts`; include Pro/Business entitlement notes and `POST /api/v1/t` single/batch bounds.
- [ ] Expand `PublicApiOperationDefinition.method` to include `PUT`, catalog both integration operations, and share an exported MCP tool inventory whose computed count changes from 35 to 40.
- [ ] Move current `public/llms.txt` authored content into `scripts/llms-template.ts` as a deterministic generator input. Build the analytics REST/MCP inventory from exported catalogs so the count cannot be hand-edited stale.
- [ ] Extend `GeneratedApiArtifacts` with `llmsText`; make `bun run docs:generate` write all three artifacts and `bun run docs:check` compare all three.
- [ ] Update `src/lib/api-reference.ts` with integration routes, filter examples, detailed aggregate response shape, privacy exclusions, and custom-range behavior.
- [ ] Update `src/pages/Docs.tsx` with all five MCP analytics tools, inputs, aggregate outputs, project scope, entitlement behavior, and the corrected computed tool count.
- [ ] Update README API/MCP feature descriptions and say the catalog/template generator owns OpenAPI, endpoint audit, and llms.txt.
- [ ] Run `bun run docs:generate`.
- [ ] Rerun `bun test tests/api-docs-analytics.test.ts` and verify GREEN.
- [ ] Run `bun run docs:check` and verify GREEN.
- [ ] Inspect `git diff -- public/openapi.json docs/api-endpoint-audit.md public/llms.txt src/pages/Docs.tsx README.md` for exact REST/MCP parity and no manual-artifact drift.
- [ ] Commit with `git commit -m "docs: publish analytics REST and MCP contracts"`.

## Task 12: Run the release gate and write the no-surprises deployment runbook

**Files:**

- Create: `docs/deployment/detailed-funnel-analytics.md`
- Modify only if verification finds a defect: files already changed in Tasks 1–11

- [ ] Write the runbook with the approved order: record current Worker/widget versions; list remote migrations; review pending SQL; apply only the known required migration if still pending; deploy Worker/SPA; deploy widgets; verify docs; run Free/Pro direct/widget REST/MCP/provider smoke checks; record Analytics Engine ingestion boundary.
- [ ] Include the exact preflight command `wrangler d1 migrations list DB --remote`, the known `0033_persist_booking_calendar_identity.sql` prerequisite, and the instruction not to use `bun run deploy:full` blindly.
- [ ] Include rollback: disable provider publication, restore previous widgets, roll the Worker back through Cloudflare Versions, retain additive Analytics Engine rows/provider settings, and do not roll back nullable migration 0033.
- [ ] Run focused tests:

  ```bash
  bun test tests/analytics-event-contract.test.ts \
    tests/analytics-integrations.test.ts \
    tests/funnel-analytics-client.test.ts \
    tests/analytics-providers.test.ts \
    tests/analytics-reporting.test.ts \
    tests/analytics-rest-api.test.ts \
    tests/analytics-mcp.test.ts \
    tests/analytics-dashboard.test.tsx \
    tests/analytics-settings.test.tsx \
    tests/api-docs-analytics.test.ts \
    tests/critical/public-booking-analytics.test.tsx \
    tests/critical/public-booking-timezones.test.tsx \
    tests/critical/form-experience.test.tsx \
    tests/critical/booking-delivery.test.ts
  ```

- [ ] Run `bun run test` and verify exit 0.
- [ ] Run `bun run lint` and verify exit 0.
- [ ] Run `bun run docs:generate`, then `bun run docs:check`, and verify exit 0 with no regenerated drift.
- [ ] Run `bun run widget:build` and verify both booking/form IIFE bundles are produced.
- [ ] Run `bun run build` and verify typecheck, Worker build, and SPA build exit 0.
- [ ] Run `git diff --check`.
- [ ] Review final diffs for: no D1 analytics migration; no raw script/URL field; no PII in telemetry/provider/report types; blobs 1–13 preserved; five MCP tools; six analytics REST routes; generated-doc parity; focused-form checkpoint bodies unchanged.
- [ ] Record fresh `git status --short --branch` and the exact verification commands/results in the final handoff.
- [ ] Commit the runbook or final verification-only corrections with `git commit -m "docs: add detailed analytics deployment runbook"`.
- [ ] Stop before any remote migration, Worker deployment, widget upload, or production smoke action. Request explicit deployment authorization from the user.

## Implementation Completion Criteria

- [ ] Direct booking/form pages and widget iframes produce one correctly attributed journey each.
- [ ] Booking funnels include dates, availability counts/times, selected time, details, attached-form screens, attempt, safe failure, and authoritative success without guest data.
- [ ] Focused forms still persist every existing checkpoint, complete only at the final checkpoint, and continue when analytics fails.
- [ ] Reports use unique journey counts, handle conditional skips, preserve existing totals, and show the detailed-data boundary.
- [ ] Free/Pro/Business entitlement behavior is enforced by the Worker for reports, integration mutation, MCP, and public provider publication.
- [ ] GA4, Meta Pixel, and PostHog receive only sanitized canonical properties from bundled, fixed-host adapters.
- [ ] REST and MCP use the same service/action implementation and enforce project scope.
- [ ] OpenAPI, endpoint audit, in-app docs, README, and llms.txt describe the shipped contracts and pass deterministic drift checks.
- [ ] Full tests, lint, docs checks, widget build, app/Worker build, and diff checks pass with fresh output.
