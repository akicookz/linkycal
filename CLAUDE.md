# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Primary reference

Read `AGENTS.md` first. It is the source of truth for product overview, tech stack, code conventions (function declarations, naming, imports, TS rules), DB schema conventions, and UI/branding rules (squircle radii, forest-green palette, icon+text buttons, no border separators, card-style toggle rows). Do not duplicate those conventions — follow them.

## Commands

```bash
bun run dev              # Vite dev server on :3001 (Cloudflare plugin runs worker inline)
bun run build            # cf-typegen → tsc -b → vite build
bun run lint             # eslint .
bun test                 # Bun test runner (see tests/ below)
bun test tests/worker/availability-service.test.ts   # Single test file
bun test -t "pattern"    # Filter by test name

bun run db:generate      # Generate Drizzle migration from worker/db/schema.ts changes
bun run db:migrate:dev   # Apply migrations to local D1 (.wrangler/state/...)
bun run db:migrate:prod  # Apply migrations to remote D1
bun run cf-typegen       # Regenerate worker-configuration.d.ts from wrangler.jsonc

bun run widget:build     # Build booking + form IIFE widgets into dist-widget/
bun run deploy           # build + wrangler deploy
bun run deploy:full      # build + widget:deploy + wrangler deploy + db:migrate:prod
```

Worker secrets live in `.dev.vars` locally; production secrets are set with `wrangler secret put`. Non-secret vars are in `wrangler.jsonc`.

## Architecture

### Single-worker, single-SPA topology
The whole app is one Cloudflare Worker (`worker/index.ts`) that serves both the Hono API under `/api/*` and the Vite-built SPA assets (via the `ASSETS` binding with SPA fallback). Local dev uses `@cloudflare/vite-plugin` so the worker runs in the same process as Vite — there is no separate backend server to start.

### Worker layout (`worker/`)
- `index.ts` is a ~5k-line monolith containing **all** Hono routes, middleware, plan-limit checks, Stripe webhooks, and the workflow queue consumer. New endpoints go here, not in per-feature route files.
- `services/` — one class per domain (EventType, Schedule, Booking, Availability, Calendar, Email, Form, Contact, Workflow, WorkflowExecution, ApiKey, Analytics). Services take a `DrizzleD1Database` in their constructor and are instantiated per-request inside the route handler. They encapsulate DB access + business logic; routes stay thin.
- `lib/` — framework-agnostic helpers (Stripe client, timezone math, rich-text, field-id generation, the workflow runtime that evaluates steps/conditions).
- `db/schema.ts` + `db/auth.schema.ts` — Drizzle tables. `db/drizzle/` holds generated SQL migrations; `drizzle.config.ts` auto-discovers the miniflare SQLite file.
- `validation.ts` — **every** Zod schema for request bodies lives here. Routes call the generic `validate<T>(schema, data)` helper; never define ad-hoc schemas in route handlers.
- `auth.ts` — Better Auth factory (Google + Facebook + Email OTP) wrapped with `better-auth-cloudflare` for D1 + geolocation.
- `types.ts` — `AppEnv` (Cloudflare bindings), `HonoAppContext`, `Plan`, `PlanLimits`.

### SPA layout (`src/`)
Routing (`App.tsx`) is **project-scoped**: all dashboard routes live under `/app/projects/:projectId/*`. Auth + onboarding guards wrap the `/app` layout; `DashboardRedirect` sends the root `/app` to the user's first project. Public pages (`/f/:formSlug`, `/:projectSlug/:eventSlug`) are outside `/app`.

**Route ordering matters**: the public booking route `/:projectSlug/:eventSlug` is a 2-segment catch-all and must stay last. Any new top-level route added above it must not conflict with 2-segment paths.

State is `@tanstack/react-query` (no Redux, no Zustand). `src/lib/query-client.ts` configures the client; `src/lib/auth-client.ts` wraps Better Auth's client.

### Data flow: workflows
Workflows are the async automation layer. A trigger (form submitted, booking created, etc.) builds a `TriggerContext` and enqueues to the `linkycal-workflows` Cloudflare Queue (producer binding `WORKFLOW_QUEUE`). The same `worker/index.ts` exports the queue consumer, which invokes `WorkflowExecutionService` to walk steps and evaluate conditions via `worker/lib/workflow-runtime.ts`. Keep trigger fan-out synchronous-to-enqueue only; actual work belongs in the consumer.

### Widgets (`widget/`)
Embeddable booking and form widgets build as self-contained IIFE bundles via separate Vite configs (`widget/booking/vite.config.ts`, `widget/form/vite.config.ts`) and get uploaded to R2 at `widgets/booking.js` and `widgets/form.js`. They share code from `widget/shared/` and cannot import from `src/` — treat them as independent bundles.

## Testing

Tests use Bun's built-in runner (`bun test`). Tests live in `tests/` and `tests/worker/`. They're unit-style — services are instantiated with an in-memory or mocked Drizzle instance rather than spinning up miniflare. When adding a service, add a matching `tests/worker/<service>.test.ts`.

## Things that bite

- After editing `wrangler.jsonc` bindings, run `bun run cf-typegen` or `AppEnv` will be stale and worker types will drift.
- `worker-configuration.d.ts` is generated — do not hand-edit.
- Drizzle migrations are applied separately to local vs remote D1; forgetting `db:migrate:prod` after a deploy is a common cause of prod 500s.
- `verbatimModuleSyntax: true` is on — always `import type` for type-only imports or the build fails.
- There are three tsconfigs (`tsconfig.app.json`, `tsconfig.worker.json`, `tsconfig.node.json`) referenced from the root. `tsc -b` builds all of them.
