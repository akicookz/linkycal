# Muted Focused Input Surfaces Implementation Plan

> **For agentic workers:** Execute inline in the current workspace. Do not dispatch subagents and do not commit.

**Goal:** Add a subtle primary-colored tint to focused text inputs and textareas across standalone and booking form surfaces.

**Architecture:** Update the shared `FocusedFieldInput` surface classes so every consumer inherits the same treatment. Preserve the existing ring-shadow and density variants, with render-contract coverage for the new tint.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Bun test

## Global Constraints

- Resting fill: `bg-primary/[0.03]`.
- Focused fill: `focus:bg-primary/[0.045]`.
- Choice-card fill remains unchanged.
- Keep all work uncommitted.

---

### Task 1: Theme-aware input tint

**Files:**
- Modify: `tests/form-experience-render.test.tsx`
- Modify: `src/components/FocusedFieldInput.tsx`

**Interfaces:**
- Consumes: existing `FocusedFieldInput` text and textarea render paths.
- Produces: theme-aware resting and focused surface fills for all shared focused inputs.

- [ ] **Step 1: Write the failing render-contract assertion**

Add assertions that focused text input markup contains `bg-primary/[0.03]` and `focus:bg-primary/[0.045]`.

- [ ] **Step 2: Verify the assertion fails**

Run `bun test tests/form-experience-render.test.tsx` and expect failure because the input still uses `bg-background/80` and `focus:bg-background`.

- [ ] **Step 3: Apply the shared tint**

Replace `bg-background/80` with `bg-primary/[0.03]` and `focus:bg-background` with `focus:bg-primary/[0.045]` on both text input and textarea class lists. Do not change choice-card styling.

- [ ] **Step 4: Verify the implementation**

Run `bun test tests/form-experience-render.test.tsx`, `bunx tsc -p tsconfig.app.json --noEmit`, `bun run build`, and `git diff --check`; expect all commands to succeed.
