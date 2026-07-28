# Repository README Design

**Date:** 2026-07-28

## Goal

Create the canonical internal guide for contributors and coding agents working
on the private LinkyCal SaaS repository. The guide must explain what the product
does, how the deployed system is arranged, where code belongs, how to run it,
and what qualifies as a useful test.

This is not a marketing page, public SDK guide, or self-hosting manual.

## Files

- Create `README.md`.
- Update `AGENTS.md` to identify `README.md` as the primary repository,
  architecture, commands, and testing guide. Keep agent-specific code and UI
  rules in `AGENTS.md`.
- Update `CLAUDE.md` to require reading `README.md` for repository context and
  testing criteria, then `AGENTS.md` for detailed implementation conventions.

## README structure

1. **Project overview** — LinkyCal as form, scheduling, contact, API, widget,
   and workflow infrastructure delivered as a SaaS.
2. **Product capabilities** — forms, bookings, calendar delivery, CRM,
   workflows, public API, MCP, and embeddable widgets.
3. **System architecture** — React SPA and Hono API in one Cloudflare Worker,
   with D1, KV, R2, Queues, Durable Objects, Google Calendar, Resend, Stripe,
   Better Auth, and PostHog at their real boundaries.
4. **Repository map** — the responsibility of `src/`, `worker/`, `widget/`,
   `tests/critical/`, `tests/support/`, migrations, generated API docs, and
   planning/spec documents.
5. **Local development** — Bun-only installation, `.dev.vars`, local D1
   migrations, the single Vite/Worker dev process on port 3001, and generated
   Cloudflare types.
6. **Commands** — authoritative scripts copied from `package.json`, grouped by
   development, validation, database, widgets, documentation, and deployment.
7. **Testing criteria** — the repository's test-admission rule, rejected test
   patterns, permitted test boundaries, and required red/green proof.
8. **Critical suite ownership** — the tangible user failures owned by each of
   the five files under `tests/critical/`, without treating test count as a
   quality metric.
9. **Change verification** — the smallest relevant focused test during work,
   then the full suite, lint, build, docs check where applicable, widget build
   where applicable, and migration checks where applicable.
10. **Operational cautions** — generated files, route ordering, local versus
    remote migrations, project scoping, secrets, asynchronous workflow
    execution, and independently built widgets.
11. **Further documentation** — links to `AGENTS.md`, `CLAUDE.md`, API audit,
    and current design/implementation documents.

## Testing standard

Every test must earn its place by protecting a distinct user-visible,
persistence, security, delivery, or interoperability failure. It must exercise
the production path capable of causing that failure and assert the final
observable result.

Admitted tests must:

- name the regression they prevent;
- use literal expectations independent from the production calculation under
  test;
- cross real production seams when wiring is the risk;
- replace only external or non-hermetic boundaries;
- prove they fail when the protected behavior is missing or broken;
- consolidate equivalent inputs instead of multiplying cases;
- avoid duplicating a contract already owned by a stronger journey.

The suite must reject test-count and coverage targets, source-text tests,
type-shape trivia, mock-call-only assertions, styling and DOM-structure checks,
opaque snapshots, and tests that merely restate implementation.

## Accuracy and maintenance

- Commands come from `package.json`; configuration claims come from the checked
  in Vite, Wrangler, Bun, and TypeScript configuration.
- Do not expose values from `.dev.vars` or imply that production secrets belong
  in the repository.
- Do not hard-code a test count in the README.
- Prefer stable subsystem responsibilities over route or table counts that
  become stale.
- `README.md` owns repository and testing context. `AGENTS.md` and `CLAUDE.md`
  link to it rather than maintaining competing summaries.

## Acceptance criteria

- A contributor can identify the correct subsystem and command without reading
  the entire codebase.
- The README accurately describes the single-worker topology and internal SaaS
  operation.
- The testing section makes vanity tests explicitly inadmissible and explains
  how to demonstrate that a test protects real behavior.
- Every referenced local file and command exists.
- `AGENTS.md` and `CLAUDE.md` visibly direct readers to the README.
- Markdown contains no placeholders, fake badges, marketing filler, secret
  values, or self-hosting instructions.
