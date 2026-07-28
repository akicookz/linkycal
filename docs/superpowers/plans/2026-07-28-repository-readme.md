# Repository README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the canonical internal README for LinkyCal contributors and
make AGENTS.md and CLAUDE.md reference it.

**Architecture:** Keep stable repository, product, architecture, command, and
testing context in `README.md`. Keep agent-specific implementation and UI rules
in `AGENTS.md`, and Claude-specific guidance in `CLAUDE.md`; both point to the
README instead of maintaining competing repository summaries.

**Tech Stack:** Markdown, Bun, React 19, Vite, Hono, Cloudflare Workers/D1/KV/R2/Queues/Durable Objects, Drizzle.

## Global Constraints

- This is an internal SaaS repository guide, not a marketing or self-hosting document.
- Bun is the only package manager shown.
- Commands must match `package.json`.
- Do not expose `.dev.vars` values or production secrets.
- Do not publish a test-count or coverage target.
- Every testing rule must protect observable behavior rather than implementation trivia.

---

### Task 1: Canonical repository README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `package.json`, `wrangler.jsonc`, `vite.config.ts`, `bunfig.toml`, repository directories, and `tests/critical/*`
- Produces: the canonical internal guide for product, architecture, repository layout, commands, testing criteria, verification, and operational cautions

- [x] **Step 1: Write the README**

Create these sections with repository-backed content:

```markdown
# LinkyCal
## What LinkyCal does
## System architecture
## Repository map
## Local development
## Commands
## Testing: every test earns its place
## Critical test ownership
## Verification by change type
## Operational cautions
## Further documentation
```

The testing section must include the admission requirements and rejected
patterns from
`docs/superpowers/specs/2026-07-28-repository-readme-design.md`.

- [x] **Step 2: Check commands and paths against the repository**

Verify every documented `bun run <script>` exists in `package.json` and every
linked local file exists.

### Task 2: Agent references

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `README.md`
- Produces: visible instructions directing agents to the canonical repository and testing guide

- [x] **Step 1: Add the AGENTS.md reference**

Add near the top:

```markdown
## Primary repository guide

Read `README.md` first for product scope, architecture, repository layout,
commands, and the test-admission standard. This file adds implementation,
database, and UI conventions for coding agents.
```

- [x] **Step 2: Update the CLAUDE.md reference**

Make its primary-reference section require `README.md` first and `AGENTS.md`
second, without duplicating the README's product or testing material.

### Task 3: Verification

**Files:**
- Review: `README.md`
- Review: `AGENTS.md`
- Review: `CLAUDE.md`

**Interfaces:**
- Consumes: the completed documentation changes
- Produces: an internally consistent, repository-accurate documentation set

- [x] **Step 1: Scan for forbidden or stale content**

Run:

```bash
rg -n "TBD|TODO|PLACEHOLDER|npm |yarn |coverage target|test count|self-host" README.md AGENTS.md CLAUDE.md
```

Expected: only intentional statements rejecting self-hosting/test-count goals;
no placeholders or npm/yarn instructions.

- [x] **Step 2: Validate commands and links**

Compare README commands with the `scripts` object in `package.json`. Resolve
every relative Markdown link from the repository root and confirm the target
exists.

- [x] **Step 3: Run repository checks**

Run:

```bash
git diff --check
bun run docs:check
```

Expected: both commands exit successfully.

- [x] **Step 4: Review the final diff**

Confirm the diff contains only `README.md`, the two agent references, and this
implementation plan.
