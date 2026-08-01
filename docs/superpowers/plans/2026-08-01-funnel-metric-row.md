# Funnel Metric Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render detailed funnel metrics as one compact numeric value per label and keep all metric columns aligned between rows.

**Architecture:** Keep formatting and layout local to `DetailedFunnel`. A small shared formatter in that component compacts count values, while an explicit outer grid and equal inner metric tracks make every row use the same geometry. Keep the existing dashboard journey focused on selected-resource behavior; verify presentational copy and geometry visually instead of with literal text assertions.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Testing Library, Bun test

## Global Constraints

- Show `Visitors 10`, `Continued 20`, and `Drop-off 80` without `%`, `continued`, `dropped`, a ratio, or a secondary line.
- Show completion stages with the same `Continued` rate as every other row.
- Compact counts as `999`, `1K`, `1.2K`, `10K`, `100K`, and `1M`, with no trailing `.0`.
- Round continuation and drop-off rates to whole numbers from `0` through `100`.
- Use the same three equal metric columns in every row at narrow and wide widths.
- Preserve the existing surfaces, stage icons, skipped counts, and responsive identity stacking.
- Keep numeric values tabular and on one line.
- Do not add literal-copy assertions for presentational metric values.
- Do not add dependencies.

---

### Task 1: Compact and align detailed funnel metrics

**Files:**
- Modify: `src/components/analytics/DetailedFunnel.tsx:21-130`

**Interfaces:**
- Consumes: `FunnelStageReport.visitors`, `continuationRate`, `dropOffRate`, `kind`, and `label`.
- Produces: `formatCompactNumber(value: number): string` and an accessible stage group named `<stage label> funnel stage`.

- [x] **Step 1: Implement count formatting, concise values, and stable columns**

In `DetailedFunnel.tsx`, add:

```ts
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}
```

Give the inner stage surface `role="group"` and
`aria-label={`${stage.label} funnel stage`}`. Replace its wide-screen flex
layout with:

```tsx
className="grid gap-3 rounded-[12px] bg-background px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center"
```

Render the metric area with:

```tsx
className="grid grid-cols-3 gap-x-4 pl-[52px] sm:pl-0"
```

Use `formatCompactNumber(stage.visitors)`,
`Math.round(stage.continuationRate)`, and `Math.round(stage.dropOffRate)` as
the only numeric values for every stage, including completion. Keep
`whitespace-nowrap` and `tabular-nums` on numeric values, and remove the old
drop-off secondary paragraph entirely.

- [x] **Step 2: Run the existing analytics dashboard file**

Run:

```bash
bun test tests/analytics-dashboard.test.tsx
```

Expected: both commands PASS.

- [x] **Step 3: Run static and production verification**

Run:

```bash
bunx eslint src/components/analytics/DetailedFunnel.tsx
bun run build
```

Expected: both commands exit successfully.

- [x] **Step 4: Visually inspect representative widths**

Start the local app with `bun run dev`, open the selected Bookings analytics
funnel, and inspect one wide viewport and one narrow viewport. Confirm that
Visitors, Continued, and Drop-off begin at the same horizontal positions in
every row, values remain on one line, and no old suffix or secondary drop-off
line is visible.

- [x] **Step 5: Commit the implementation**

```bash
git add src/components/analytics/DetailedFunnel.tsx tests/analytics-dashboard.test.tsx docs/superpowers/plans/2026-08-01-funnel-metric-row.md
git commit -m "fix: tighten funnel metric rows"
```
