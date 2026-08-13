# LinkyCal

LinkyCal is the private application repository for LinkyCal's form and
scheduling infrastructure SaaS. It combines project-scoped forms, booking
pages, calendar delivery, contact management, workflows, APIs, MCP tools, and
embeddable widgets in one product.

This README is the canonical guide to the product, repository, architecture,
commands, and testing standard. Coding agents must also read
[AGENTS.md](AGENTS.md) for implementation and UI conventions. Claude Code must
also follow [CLAUDE.md](CLAUDE.md).

## What LinkyCal does

- Builds multi-step forms with focused, grouped, and classic presentation
  modes, conditional steps and fields, prefilling, contact mapping, and themed
  public experiences.
- Publishes booking pages backed by organizer-local schedules, overrides,
  buffers, booking limits, notice periods, confirmation flows, and Google
  Calendar free/busy data.
- Creates and updates Google Calendar events, sends transactional email through
  Resend, and attaches standards-compliant calendar invitations.
- Maintains project-scoped contacts, tags, saved views, activity, pipeline
  stages, enrichment, and next actions.
- Runs queued workflows for form, booking, contact, schedule, webhook, email,
  tag, update, wait, condition, and AI-research operations.
- Exposes a REST API, generated OpenAPI/LLM documentation, project-scoped MCP
  tools, and self-contained booking and form widgets.
- Reports unique-journey booking and form funnels down to rendered dates,
  availability, times, questions, conditional skips, validation, submit
  failures, and completion; Pro/Business projects may also publish validated
  GA4, Meta Pixel, and PostHog identifiers.
- Handles team access, subscriptions, plan entitlements, onboarding,
  authentication, product analytics, and Stripe billing.

LinkyCal is operated as a SaaS. This repository is not a public distribution or
self-hosting package.

## System architecture

The dashboard SPA and Hono API ship as one Cloudflare Worker. Local development
uses the Cloudflare Vite plugin, so there is no second backend process to start.

```text
Dashboard SPA ─┐
Public pages  ─┼─> Cloudflare Worker
Widgets       ─┤     ├─ Hono API and auth
REST clients  ─┤     ├─ D1 through Drizzle
MCP clients   ─┘     ├─ KV, R2, Analytics Engine
                      ├─ Queues and MCP Durable Object
                      └─ Google Calendar, Resend, Stripe, AI providers
```

The main boundaries are:

| Boundary | Responsibility |
| --- | --- |
| React 19 SPA | Dashboard, builders, settings, public forms, and public booking pages |
| Hono Worker | Routes, middleware, auth, access control, validation, webhooks, queue consumer, and SPA delivery |
| Drizzle + D1 | Authentication and all project-domain persistence |
| Cloudflare KV | Cached data |
| Cloudflare R2 | Uploads and deployed widget bundles |
| Cloudflare Queues | Asynchronous workflow execution |
| Durable Objects | Project-scoped MCP transport and state |
| Google Calendar | Free/busy checks and event lifecycle |
| Resend | Transactional and workflow email |
| Stripe | Plans, checkout, subscriptions, and billing webhooks |
| PostHog / Analytics Engine | Internal product analytics and additive, PII-free customer funnel analytics |

All dashboard and API data is project-scoped. MCP OAuth authorization binds a
grant to one eligible project before tools execute; callers do not choose an
untrusted `projectId` tool argument.

Detailed customer analytics uses the existing Cloudflare Analytics Engine
dataset rather than D1 tables. The existing high-level event names remain
stable; detailed booking/form events add resource-scoped anonymous journey,
stage, source, device, and bounded safe context fields. Reports never expose
names, emails, raw answers, journey IDs, IP addresses, or raw errors.

The canonical analytics REST contract is:

```text
GET /api/projects/:projectId/analytics/filters
GET /api/projects/:projectId/analytics/overview
GET /api/projects/:projectId/analytics/bookings
GET /api/projects/:projectId/analytics/forms
GET /api/projects/:projectId/analytics/integrations
PUT /api/projects/:projectId/analytics/integrations/:provider
```

All six routes accept a dashboard session or a project-scoped API key and are
Pro/Business-gated by the Worker. The MCP server exposes 92 tools, including
five analytics tools that call the same reporting and integration actions.
Public booking pages, forms, and widgets receive only enabled public provider
identifiers; raw scripts, arbitrary URLs, and provider secrets are not stored.

## Plans and entitlements

The shared catalog in `shared/plan-catalog.ts` is authoritative for enforcement,
billing UI, onboarding, and the public pricing page. API and MCP access,
standard form/booking widgets, theme overrides, and unlimited bookings are
included on every plan. Custom CSS and branding removal start on Pro.

| Limit | Free | Pro | Business |
| --- | ---: | ---: | ---: |
| Price/month | $0 | $29 | $99 |
| Annual monthly equivalent | $0 | $24 | $82 |
| Projects | 1 | 5 | 20 |
| Forms per project | 3 | 20 | Unlimited |
| Event types per project | 3 | 20 | Unlimited |
| Contacts per project | 500 | 5,000 | 10,000 |
| Workflows per project | 1 | 10 | Unlimited |
| Form responses per workspace/month | 500 | 10,000 | 50,000 |
| Workflow executions per workspace/month | 250 | 5,000 | 25,000 |
| Transactional emails per workspace/month | 500 | 10,000 | 50,000 |
| API + MCP requests per workspace/month | 10,000 | 100,000 | 1,000,000 |
| Enrichments per workspace/month | 5 | 50 | 100 |
| Storage per workspace | 500 MB | 10 GB | 50 GB |
| Calendar connections | 1 | Unlimited | Unlimited |
| Team members | Not included | Unlimited | Unlimited |
| Analytics history | Not included | 12 months | 36 months |

Feature/resource denials use structured HTTP 403 responses; metered/storage
denials use structured HTTP 429 responses and include `code`, `entitlement`,
`scope`, `used`, `limit`, `hardLimit`, `resetAt`, and `recommendedPlan`. MCP
tools return the same object in `structuredContent.entitlementError`.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/` | React SPA, route-level pages, UI components, hooks, and browser clients |
| `worker/index.ts` | Worker entry point, Hono routes and middleware, webhooks, scheduled work, and queue consumption |
| `worker/services/` | Domain services containing database access and business operations |
| `worker/lib/` | Shared production actions and framework-independent domain helpers |
| `worker/db/` | Drizzle schemas, database connection, and generated SQL migrations |
| `worker/mcp/` | MCP Durable Object and project-scoped tool handlers |
| `worker/validation.ts` | Central Zod request schemas |
| `widget/booking/` | Self-contained booking widget entry and build |
| `widget/form/` | Self-contained form widget entry and build |
| `widget/shared/` | Code shared by widget bundles |
| `tests/critical/` | Small, user-outcome-oriented product test suite |
| `tests/support/` | Migration-backed database, HTTP capture, queue, clock, and render infrastructure |
| `scripts/` | Checked REST/MCP inventories plus deterministic OpenAPI, endpoint-audit, and llms.txt generators |
| `public/openapi.json` | Generated OpenAPI document |
| `public/llms.txt` | Generated AI-readable API documentation |
| `docs/superpowers/specs/` | Approved feature and remediation designs |
| `docs/superpowers/plans/` | Implementation plans |
| `wrangler.jsonc` | Worker bindings, queues, Durable Objects, schedules, and non-secret variables |

The public booking route is a two-segment catch-all and must remain after more
specific top-level SPA routes.

## Local development

### Prerequisites

- [Bun](https://bun.sh/) for package management, scripts, and tests.
- Access to the LinkyCal Cloudflare account and any external provider accounts
  needed for the subsystem being exercised.
- A locally provisioned `.dev.vars`. It contains secrets and must never be
  committed or copied into documentation.

Do not use npm or Yarn in this repository.

### Start the application

```bash
bun install
bun run cf-typegen
bun run db:migrate:dev
bun run dev
```

The application runs at `http://localhost:3001`. Vite serves the SPA and runs
the Worker inline.

`wrangler.jsonc` marks D1, R2, and KV bindings as remote. Understand which
environment a command targets before changing data. `db:migrate:dev` applies
migrations to local D1 state; it does not migrate production.

## Commands

### Development and validation

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Vite and Worker development server on port 3001 |
| `bun run test` | Run the full Bun test suite |
| `bun run test:critical` | Run the critical user-outcome suite |
| `bun run lint` | Run ESLint |
| `bun run build` | Regenerate Cloudflare types, type-check all projects, and build Worker and client bundles |
| `bun run preview` | Build and preview the production output |

### Database and generated types

| Command | Purpose |
| --- | --- |
| `bun run db:generate` | Generate a Drizzle migration from schema changes |
| `bun run db:migrate:dev` | Apply D1 migrations to local state |
| `bun run db:migrate:prod` | Apply D1 migrations to production |
| `bun run cf-typegen` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |

### API documentation

| Command | Purpose |
| --- | --- |
| `bun run docs:generate` | Regenerate OpenAPI, endpoint audit, and LLM-facing API documentation |
| `bun run docs:check` | Fail when OpenAPI, endpoint audit, or llms.txt is stale |

### Widgets and deployment

| Command | Purpose |
| --- | --- |
| `bun run widget:build:booking` | Build the booking IIFE bundle |
| `bun run widget:build:form` | Build the form IIFE bundle |
| `bun run widget:build` | Build both widget bundles |
| `bun run widget:upload` | Upload both built widgets to production R2 |
| `bun run widget:deploy` | Build and upload both widgets |
| `bun run deploy` | Build and deploy the Worker |
| `bun run deploy:full` | Build, migrate production D1, deploy widgets, and deploy the Worker |

The production migration, upload, and deployment commands mutate live systems.
Run them only when that outcome is explicitly intended.

## Testing: every test earns its place

Test count and coverage percentage are not quality goals in this repository. A
test belongs only when it protects a distinct failure that matters to a user,
stored data, security, delivery, or an external protocol.

### Test admission criteria

A test must satisfy all of these:

1. Its name identifies the regression or user harm it prevents.
2. It exercises the production path capable of causing that failure.
3. It asserts a final observable result: rendered behavior, persisted state,
   outbound payload, authorization boundary, queue result, or protocol output.
4. Its expected values are literal and independent from the production
   calculation under test.
5. It fails for a clear reason when the protected behavior is removed or
   broken.
6. A stronger existing journey does not already require the same behavior.
7. Equivalent inputs are consolidated into one labeled table or scenario
   instead of multiplied into separate tests.

The red check is regression proof, not a development ideology: demonstrate that
the test detects the missing or broken behavior before relying on it.

### Tests that do not belong

Do not add:

- tests whose only assertion is that a string is a string, an export exists, or
  a mock was called;
- source-text, type-shape, implementation-key, or private-method tests;
- Tailwind class, DOM ancestry, markup-shape, or opaque snapshot assertions;
- one test per trivial input when one semantic scenario owns the branch;
- unit tests that duplicate a stronger component or service journey;
- tests written to increase a count, coverage percentage, or dashboard metric;
- tests that reproduce the production algorithm to calculate their own
  expected answer;
- permissive fakes that accept malformed authentication or provider payloads.

Delete or consolidate a test when it no longer owns a distinct failure.

### Test boundaries

Critical tests use real production functions, services, actions, components,
validation, and every production D1 migration. Replace only boundaries that
cannot run hermetically:

- capture `fetch` for Google, Resend, webhooks, and public API requests;
- use deterministic Cloudflare queue and `waitUntil` collectors;
- fix the wall clock and viewer timezone;
- provide deterministic provider responses for AI operations.

Provider doubles must reject malformed protocol details. Assertions inspect the
actual request or final persisted result, not merely the number of calls.

### Adding or changing a test

1. State the tangible failure in the test name.
2. Find the strongest existing journey that should own it.
3. Add literal expectations for the user-facing or protocol result.
4. Show that the assertion fails against the missing or deliberately broken
   production behavior.
5. Make the smallest production correction.
6. Run the owning test file, then the full suite.
7. Remove weaker or redundant assertions exposed by the stronger contract.

## Critical test ownership

The suite is intentionally organized by user outcome:

| Suite | What it protects |
| --- | --- |
| `tests/critical/availability-timezones.test.ts` | Organizer/viewer timezone conversion, DST gaps and repeats, extreme date overlap, busy intervals, buffers, notice periods, overrides, and real slot generation |
| `tests/critical/public-booking-timezones.test.tsx` | The rendered booking calendar, viewer-local dates and labels, production event projection, availability queries, and submitted UTC instant |
| `tests/critical/booking-delivery.test.ts` | Booking caps and lifecycle, Google OAuth/event payloads, attendees, provider identity persistence, Resend content, ICS data, approval, cancellation, decline, and form-response delivery |
| `tests/critical/form-experience.test.tsx` | Persisted focused/grouped/classic settings, rendering, validation, submission wiring, conditional fields, and stale-answer removal |
| `tests/critical/workflow-journeys.test.ts` | Triggering, queue execution, conditions, waits, replay safety, mutations, exact email/webhook payloads, provider failure, and secret-safe persistence |

Support code under `tests/support/` may model infrastructure, but it must not
reimplement the production decision the owning test claims to verify.

## Verification by change type

During implementation, run the smallest relevant command for fast feedback.
Before handing work off, run every applicable final check.

| Change | Required checks |
| --- | --- |
| SPA, Worker, service, or shared domain code | Owning critical test file, `bun run test`, `bun run lint`, `bun run build` |
| Test-only change | Owning test file, `bun run test`, `bun run lint` |
| API route or schema exposed in generated docs | Relevant tests, `bun run docs:check`, `bun run build` |
| `worker/db/schema.ts` | `bun run db:generate`, inspect generated SQL, `bun run db:migrate:dev`, relevant tests, `bun run build` |
| `wrangler.jsonc` binding | `bun run cf-typegen`, `bun run build` |
| Booking or form widget | Relevant production tests, `bun run widget:build`, `bun run build` |
| Markdown-only documentation | Validate commands and links, `bun run docs:check` when generated API claims changed, `git diff --check` |

Warnings are not failures, but new warnings introduced by a change must be
understood rather than ignored.

## Operational cautions

- `worker-configuration.d.ts`, `public/openapi.json`,
  `docs/api-endpoint-audit.md`, and `public/llms.txt` are generated. Change the
  REST/MCP catalogs or llms template and rerun the owning generator.
- D1 schema changes require a checked-in migration. Local and production
  migrations are separate operations.
- Every authenticated service, route, API key, and MCP tool must preserve
  project scope. Never accept a caller-supplied project boundary without access
  resolution.
- Workflow triggers enqueue quickly; side effects and continuation belong in
  the queue consumer. Persisted logs and context must not leak credentials.
- Calendar availability uses organizer-local rules projected into viewer-local
  dates. Buffers, notice periods, busy time, confirmation, and booking caps
  must agree between displayed availability and booking creation.
- Widgets are independent IIFE bundles. They cannot assume the dashboard bundle
  exists and must be built separately.
- Never commit `.dev.vars`, provider tokens, OAuth credentials, encryption
  keys, Stripe secrets, or production data.

## Further documentation

- [Agent implementation and UI conventions](AGENTS.md)
- [Claude Code guidance](CLAUDE.md)
- [API endpoint audit](docs/api-endpoint-audit.md)
- [Generated OpenAPI document](public/openapi.json)
- [Generated LLM documentation](public/llms.txt)
- [Approved designs](docs/superpowers/specs/)
- [Implementation plans](docs/superpowers/plans/)
