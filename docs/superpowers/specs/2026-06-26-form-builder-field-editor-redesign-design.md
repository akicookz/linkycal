# Form Builder field-editor redesign + section images

Date: 2026-06-26
Status: Approved

## Goal

Redesign the form builder's right-hand settings panel (Choices editor + Required
toggle), add section-level images with split layouts, and polish the public form
page. All changes follow existing AGENTS.md UI conventions (squircle radii,
forest-green palette, no border separators, card-style toggle rows).

## Scope

In scope:
1. Choices editor redesign (Question Settings panel)
2. Required toggle: drop the helper subtext
3. Section images + split layout (section-level only), non-destructive crop
4. Public form page polish (width, logo, nav carets)

Out of scope: per-field images, server-side image cropping, changes to the
existing question/section drag in the left Content panel.

## 1. Choices editor (`src/pages/FormBuilder.tsx`, ~lines 2752–2833)

Each choice row becomes one compact row, reordered by drag:

- **Floating drag handle, left:** a `GripVertical` grip absolutely positioned just
  left of the input, `opacity-0` → visible on row `group-hover`. Absolute so it
  never takes layout space or pushes the input. It is the dnd-kit drag listener.
- **Input:** `flex-1`.
- **Delete:** `✕` icon-only ghost button (destructive on hover). No "Remove" text.
- **Up/Down buttons removed** — reorder is drag-only.
- **"Add option":** full-width outline button below the list, styled like the
  existing add/section buttons (`+ Add option`).

Reorder is wired with a nested `DndContext` + `SortableContext`
(`verticalListSortingStrategy`) using `@dnd-kit` already imported in the file.
On drag end, reorder the options array and persist via the existing
`saveFieldOptions` path. Each option needs a stable sortable id (the existing
`opt.id`).

## 2. Required toggle (~lines 2694–2710)

Remove the `<p>Respondents must answer to continue</p>` subtext. Keep the
"Required" label + `Switch` in the card-style row.

## 3. Section images + split layout

### Storage (no DB migration)
Persist in the step's existing `settings` JSON column
(`formSteps.settings`, already holds `groupFields`):

```ts
settings.image = {
  url: string;
  layout: "left" | "right" | "top";  // position of image relative to content
  scale: number;    // zoom, 1 = fit (cover). e.g. 1.6
  focusX: number;   // 0–100, object-position X %
  focusY: number;   // 0–100, object-position Y %
}
```

A tiny pure helper derives the render style:
`sectionImageStyle({scale, focusX, focusY}) => { objectPosition, transform }`.
Lives in `src/lib/form-sections.ts` (co-located with `sectionShowsFieldsTogether`).
This is the one unit worth a test.

### Builder editor (Section Settings panel, after "Show questions together")
New `SectionImageField` component:
- Upload via existing `POST /api/projects/:projectId/uploads` (returns `{url}`).
- **Max 2 MB** (overrides the shared ImageUpload's 5 MB; enforced in this
  component).
- Focal/zoom editor: a fixed-aspect frame showing the image with
  `object-position`/`transform`; **drag to pan** (updates focusX/focusY), **zoom
  slider** (updates scale). No new dependency, no canvas export.
- Layout selector: image **Left / Right / Top** (icon+text segmented control).
- Remove button clears `settings.image`.
All edits persist through the existing `updateStepMutation` (merge into settings).

### Public form rendering (`src/pages/PublicForm.tsx`)
The image renders in its chosen position as a ~50/50 split:
- **Focused mode:** the section's image is pinned for **every screen within that
  section** (statement/question/group screens share `stepId`, so the same image
  shows across them). `FocusedShell` gains an optional `media`+`layout`; when set,
  it renders a split (image column + content column) instead of the centered
  `max-w-2xl` column.
- **Classic mode:** the step's block renders beside (left/right) or above (top)
  its image.
- Image rendered with `object-cover` + the derived `object-position`/`transform`
  from `sectionImageStyle`.

## 4. Public form page polish (`src/pages/PublicForm.tsx`)

- Widen: `PageShell` card `max-w-[52rem]` → `max-w-[60rem]`; `FocusedShell`
  content `max-w-2xl` → wider (`max-w-3xl`) to match.
- "Powered by" logo bottom-left → smaller.
- Nav carets: `ChevronUp`/`ChevronDown` → `ChevronLeft`/`ChevronRight`
  (lines ~1291, 1301).

## Verification
- `bun run lint` + `bun run build` clean.
- `bun test` (new `sectionImageStyle` unit).
- Visual check in headless Chrome: choices reorder/delete/add, section image
  upload + pan/zoom + layout, public form width/logo/carets, focused-mode
  persistent image.
