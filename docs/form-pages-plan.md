# Form pages plan

Authors build a form as pages. Respondents move from page to page. Classic and Focused go away. Transition is one form setting. Each page has a left block list and a right block list. Embeds and the public APIs keep their hosts. No D1 migration. The stack is pages-model, pages-runtime, pages-migrate, pages-builder, then pages-cleanup. The operator lands the stack.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. Owners stop at merge-ready. The operator lands pages-model through pages-cleanup bottom-up.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on her explicit go.
- [ ] On her go, arm a `/goal` with this exact text. "docs/form-pages-plan.md. PR ids pages-model, pages-runtime, pages-migrate, pages-builder, pages-cleanup. A PR is verified only when its unit, live, and perf boxes are all checked. The operator lands the stack. Done when every page is a two-column canvas, forms.type is unused, embeds still iframe the public routes, and one-field pages still emit field- analytics keys."
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:pstack/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/multi-phase-plan.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:pstack/skills/principle-sequence-verifiable-units/SKILL.md`
- [ ] Arm the 30-minute audit tick. In a local session, a real terminal `/loop`. In a cloud root, a cloud-sleeper wake chain. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk and the armed /goal. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] pages-model is first. It branches from `main`.
  - [ ] pages-runtime after pages-model.
  - [ ] pages-migrate after pages-runtime.
  - [ ] pages-builder after pages-migrate.
  - [ ] pages-cleanup after pages-builder.
- [ ] Hold the file boundaries. pages-model touches only `src/lib/form-pages.ts` and `src/lib/form-pages.test.ts`. pages-runtime touches `src/lib/form-experience.ts`, `src/components/FormExperience.tsx`, and `src/index.css`. Do not edit `widget/form/index.ts`, `widget/booking/index.ts`, `PublicBooking.tsx`, `PublicForm.tsx`, or `shared/public-chrome.ts`. pages-migrate touches `worker/services/form-service.ts`, `worker/lib/form-actions.ts`, and `worker/lib/public-form-actions.ts`. Do not add a D1 migration. pages-builder touches `src/pages/FormBuilder.tsx` and a new `src/components/FormPageCanvas.tsx`. pages-cleanup touches `src/pages/Forms.tsx`, `src/lib/api-reference.ts`, `worker/mcp/tools/forms.ts`, `shared/mcp-tools.ts`, `README.md`, `src/pages/Docs.tsx`, and leftover screen helpers.
- [ ] Hold the review gate. pages-runtime, pages-migrate, and pages-builder change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] The root appends the PR to the base-branch stack. The operator lands it bottom-up. Follow the patch-id rule from `playbooks/shipping.md`.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. Drive the browser with the Cursor browser tools when `control-ui` is missing.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Start `bun run dev`. Wait until port 3001 answers.
- [ ] Deliver input only through the browser. Use the network panel as the read-only diagnostic.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Add page layout helpers (pages-model)

**Depends on.** None.

**Files.**

- [x] Create `src/lib/form-pages.ts`.
- [x] Create `src/lib/form-pages.test.ts`.

**Build.**

- [x] Add `FormPageBlock`, `FormPageLayout`, and `FormTransition` in `src/lib/form-pages.ts`.
- [x] Add `parsePageLayout`, `defaultPageLayout`, `movePageBlock`, `parseFormTransition`, and `analyticsStageForPage`.
- [x] Store layout on `form_steps.settings.pageLayout`. Store transition on `forms.settings.transition`. The default transition is vertical.
- [x] `analyticsStageForPage` returns key `field-${fieldId}` and kind `question` when the page has exactly one non-completion field. Otherwise it returns key `step-${stepId}` and kind `step`. No new tables. No new columns.

**You see.**

- [x] `bun test src/lib/form-pages.test.ts` prints a passing suite.
- [x] `parsePageLayout(undefined)` returns every field, the title, the rich text, and the image on the left.
- [x] `movePageBlock` from left to an empty right yields two lists.
- [x] `analyticsStageForPage` on one non-completion field returns key `field-${fieldId}` and kind `question`.
- [x] `analyticsStageForPage` on many fields returns key `step-${stepId}` and kind `step`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/lib/form-pages.test.ts` covers parse of missing settings, move into an empty right list, move out of a one-item right list, reject of an unknown field id, and `analyticsStageForPage` for one-field versus many-field pages. Run `bun test src/lib/form-pages.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Run `bun test src/lib/form-pages.test.ts` at trunk and head. Trunk lacks the file. Record that. Gate that head adds the file and the command exits 0. Save `pages-model-l1.png`. Pass when head prints the passing suite.
- [x] Lane 2. Call `parsePageLayout` with no settings and three fields. Save `pages-model-l2.png`. Pass when left length equals 3 plus chrome blocks and right length equals 0.
- [x] Lane 3. Call `movePageBlock` to drop the second field on the right ghost. Save `pages-model-l3.png`. Pass when right holds that field id.
- [x] Lane 4. Move the last right block back to the left. Save `pages-model-l4.png`. Pass when right length equals 0.
- [x] Lane 5. Parse `settings.transition` equal to `horizontal`. Save `pages-model-l5.png`. Pass when `parseFormTransition` returns `horizontal`.
- [x] Lane 6. Parse a junk transition string. Save `pages-model-l6.png`. Pass when the helper returns `vertical`.
- [x] Lane 7. Parse a `pageLayout` that names a missing field id. Save `pages-model-l7.png`. Pass when that block is dropped.
- [x] Lane 8. Parse a layout that puts title on the right. Save `pages-model-l8.png`. Pass when the right list starts with kind `title`.
- [x] Lane 9. Run `bun run lint`. Save `pages-model-l9.png`. Pass when eslint exits 0.
- [x] Lane 10. Run `bun run build`. Save `pages-model-l10.png`. Pass when tsc and vite exit 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Wall time of `bun test src/lib/form-pages.test.ts`. Trunk lacks the file. Also measure the helper cost of `parsePageLayout` on a 50-field page.
- [x] Probe. Run the test command at trunk and at head. At trunk record the missing-file failure. At head record the test time. Run a 50-field parse loop at head.
- [x] Baseline. Record the trunk value first.
- [x] Rule. Head test time must stay under 2000 ms. A 50-field parse must stay under 5 ms. Do not ratio unlike trunk and head runs.

**Review gate.** None. pages-model is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends the PR to the stack. The operator lands it.

## Render every form as pages (pages-runtime)

**Depends on.** pages-model.

**Files.**

- [x] Edit `src/lib/form-experience.ts`.
- [x] Edit `src/components/FormExperience.tsx`.
- [x] Edit `src/index.css`.

**Build.**

- [ ] Stop calling `buildFocusedScreens` from the render path. Drive `currentStepIndex` only.
- [ ] Paint `currentStep` with `parsePageLayout` as two columns. An empty right list is a single column.
- [ ] Read `parseFormTransition` and set `--screen-from` on X or Y. Keep `animate-focused-screen`. Classic pages gain that motion. They do not have it today.
- [ ] Standalone pages keep the bottom-right pair in `FocusedFormExperienceShell`. Booking and the old Classic footer use Back and Next. Point both navs at the same axis. Completions keep `showNav={false}`.
- [ ] For `forms.type === "multi_step"`, build virtual pages with `pagesFromFocusedForm` so one field still equals one page until pages-migrate writes them.
- [ ] Drive `buildFormExperienceAnalyticsStages` from `analyticsStageForPage`. Stop branching on `form.type`. `PublicForm` and `PublicBooking` keep forwarding `event.screen.key`. Booking still offsets `stageOrder` by 5. Submit order stays `6 + stageCount`.
- [ ] A many-field page emits `step-${stepId}`, never `group-${stepId}`. Intro text rides the first field page. `statement-*` keys go away. `form-started` and `form-complete` stay as they are.
- [ ] Leave `widget/form/index.ts`, `widget/booking/index.ts`, `PublicBooking.tsx`, `PublicForm.tsx`, and `shared/public-chrome.ts` untouched. Embeds stay iframes of the public routes with `?embed=1` and `lc-height`. Chrome query flags still hide title, intro, media, and branding.
- [ ] Leave native `POST /api/public/forms/:projectSlug/:formSlug/submit` untouched. It posts every field at once.
- [ ] Keep the booking card at `maxWidth` 680. Two columns stack at the `md` breakpoint so a narrow embed and the booking card do not clip.
- [ ] Leave `checkpointBookingForm` a no-op until `isFinal`. Extra pages only move `currentStepIndex` inside booking step 3.
- [ ] Do not change the `lc-height` payload. Booking height still uses `document.documentElement.scrollHeight` and still does not shrink after a tall date step.

**You see.**

- [ ] A Classic public form shows every field of the current step on one page.
- [ ] A Focused public form still shows one field per page.
- [ ] Next and back animate on the chosen axis. Standalone chevrons and booking footer buttons match that axis.
- [ ] A one-field page emits `form_stage_viewed` with key `field-${fieldId}`. A many-field page emits `step-${stepId}`. A former grouped page emits `step-`, not `group-`.
- [ ] The form widget and the booking widget still resize from `lc-height`. Chrome query flags still hide title, intro, media, and branding.
- [ ] Booking step 3 Next on a non-final page does not book. The last page still calls `handleBook`. Date, time, details, and submit events stay on their old keys.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/lib/form-pages.test.ts` gains `pagesFromFocusedForm` cases for a four-field Focused step and a `groupFields` step. Run `bun test src/lib/form-pages.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the same public Classic form at trunk and head. Save `pages-runtime-l1.png`. Pass when head still shows every field of the first step and submit still works.
- [ ] Lane 2. Open a Focused form with four fields. Save `pages-runtime-l2.png`. Pass when the first page shows one field and the network has `form_stage_viewed` with key `field-` plus that field id.
- [ ] Lane 3. Press next on that Focused form. Save `pages-runtime-l3.png`. Pass when the second field is the only field.
- [ ] Lane 4. Open a Classic form with a left image. Save `pages-runtime-l4.png`. Pass when the image is a left block, not a third chrome split.
- [ ] Lane 5. Set transition to horizontal in local settings JSON and reload. Save `pages-runtime-l5.png`. Pass when next uses a horizontal motion and the chevrons sit in a row.
- [ ] Lane 6. Set transition to vertical. Save `pages-runtime-l6.png`. Pass when next uses a vertical motion and the chevrons stack.
- [ ] Lane 7. Open a booking with an attached Classic form, then with an attached Focused form. Save `pages-runtime-l7.png`. Pass when the form stays inside booking step 3, footer Back and Next still work, `maxWidth` stays 680, and Next on a non-final page does not create a booking.
- [ ] Lane 8. Open the form widget and the booking widget. Save `pages-runtime-l8.png`. Pass when both iframes use `?embed=1`, `lc-height` still sets height, `hide_branding` still hides the logo, and a two-column page stacks at `md` inside the iframe.
- [ ] Lane 9. Hide a field with a condition. Save `pages-runtime-l9.png`. Pass when that field is absent and the other column still paints.
- [ ] Lane 10. Submit the last page of a Classic form through the SPA and through native HTML POST. Save `pages-runtime-l10.png`. Pass when both responses are stored.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from public form first paint to first field input ready. Also measure `buildFormExperienceModel` on a 20-field form.
- [ ] Probe. Record first-input ready at trunk and head on the same Classic form. Run the model helper 100 times at both SHAs.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. First-input ready at head must stay within 20 percent of trunk. Model time at head must stay within 20 percent of trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 5 screenshots into `docs/media/pages-runtime-review-focused.png` and `docs/media/pages-runtime-review-horizontal.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `docs/media/pages-runtime-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends the PR to the stack. The operator lands it.

## Persist Focused forms as pages (pages-migrate)

**Depends on.** pages-runtime.

**Files.**

- [x] Edit `worker/services/form-service.ts`.
- [ ] Edit `worker/lib/form-actions.ts`.
- [ ] Edit `worker/lib/public-form-actions.ts`.

**Build.**

- [ ] On `getFullForm` and `getFullFormBySlug`, if `type` is `multi_step` and `pageLayout` is missing, explode with `pagesFromFocusedForm` and write steps. A `groupFields` step stays one page. A statement intro lands on the first field page as title and rich text.
- [ ] After a successful write, set `forms.type` to `single` so later reads skip the explode.
- [ ] Keep the write in one transaction per form. The explode is idempotent.
- [ ] Do not add endpoints. Do not add columns. Do not run `db:generate`. `pageLayout` and `transition` ride the existing settings JSON. `submitStep` still upserts by `fieldId`.
- [ ] Do not rewrite `form_responses.currentStepIndex`. A one-field exploded page must still emit `field-${fieldId}` so old Focused funnels join.
- [ ] A client that PATCHes every field id on `steps/0` with `complete` true must still complete. A client that PATCHes only step 0 and omits `complete` on an exploded form can stay `in_progress`. Document that in the API copy during pages-cleanup.

**You see.**

- [ ] A second GET of a former Focused form returns one step per field.
- [ ] A `groupFields` section is still one step.
- [ ] Public URLs keep working with the same slugs.
- [ ] MCP `get_form` and REST GET return the new step list. Field ids are unchanged.
- [ ] After explode, a one-field page still sends `form_stage_viewed` with the old `field-` key.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/lib/form-pages.test.ts` covers explode of four fields, a grouped section, a second pass that does not duplicate steps, and `analyticsStageForPage` after explode. Run `bun test src/lib/form-pages.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open a Classic public form at trunk and head. Save `pages-migrate-l1.png`. Pass when field count and submit still match.
- [ ] Lane 2. Load a four-field Focused form in the builder. Save `pages-migrate-l2.png`. Pass when the Content list shows four pages.
- [ ] Lane 3. Reload that form. Save `pages-migrate-l3.png`. Pass when the page count stays four.
- [ ] Lane 4. Load a section with Show questions together. Save `pages-migrate-l4.png`. Pass when those fields share one page.
- [ ] Lane 5. Open the public URL of the exploded form. Save `pages-migrate-l5.png`. Pass when page 1 shows the first field and the old intro text, and `form_stage_viewed` still uses `field-` plus that field id.
- [ ] Lane 6. Advance to page 2. Save `pages-migrate-l6.png`. Pass when only the second field shows.
- [ ] Lane 7. GET `/api/projects/:id/forms/:id` twice. Save `pages-migrate-l7.png`. Pass when `type` is `single` after the first GET, `steps.length` equals the old field count, and field ids match the pre-explode ids.
- [ ] Lane 8. Attach the exploded form to an event type and book, including `collectDetailsWithForm`. Save `pages-migrate-l8.png`. Pass when booking step 3 still pages the form, mapped name and email still merge or stay excluded, and the last page creates the booking.
- [ ] Lane 9. MCP `get_form` on the exploded form, then PATCH `steps/0` with every field id and `complete` true. Save `pages-migrate-l9.png`. Pass when the tool returns one step per page and the response status is completed.
- [ ] Lane 10. Create a new form from the dashboard dialog. Save `pages-migrate-l10.png`. Pass when the new form is already pages with one empty page.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Duration of `getFullForm` for a 20-field Focused form on the first GET (explode) and the second GET (no explode).
- [ ] Probe. Time both GETs at head. Time one GET of the same form at trunk (no explode).
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Second GET at head must stay within 20 percent of trunk. First GET explode must stay under 200 ms extra.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 5 screenshots into `docs/media/pages-migrate-review-list.png` and `docs/media/pages-migrate-review-public.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `docs/media/pages-migrate-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends the PR to the stack. The operator lands it.

## Build the page canvas (pages-builder)

**Depends on.** pages-migrate.

**Files.**

- [x] Edit `src/pages/FormBuilder.tsx`.
- [x] Create `src/components/FormPageCanvas.tsx`.

**Build.**

- [ ] Replace `previewCanvas` with `FormPageCanvas`. The canvas is the selected page.
- [ ] Draw two columns. The empty right column is a ghost droppable. Each gap in a column is a ghost droppable.
- [ ] Drag a field, the title, the rich text, or the image between columns. Persist with `movePageBlock` then `updateStepMutation` on `settings.pageLayout`. Spread the current step settings first. `FormService` replaces the JSON blob.
- [ ] Keep the choices `DndContext` on option ids. Do not reuse bare field ids there.
- [ ] Change the Content list to pages, not sections that hide a one-question preview. Template mode (`Onboarding.tsx`) must mount the same canvas.
- [ ] Remove the Experience select. Add a form-level Transition select that writes `settings.transition`.
- [ ] Remove Show questions together. A page with many fields is that control.

**You see.**

- [ ] The center canvas shows the whole page.
- [ ] Drop on the right ghost makes a two-column page.
- [ ] Drag back to one column restores a full-width stack.
- [ ] Transition select changes the public chevrons after save.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/lib/form-pages.test.ts` covers the drop cases the canvas calls. Run `bun test src/lib/form-pages.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the same form in the builder at trunk and head. Trunk shows one question. Record that. Gate that head shows the whole first page and can still rename a field. Save `pages-builder-l1.png`. Pass when the selected page shows every block on that page.
- [ ] Lane 2. Drop Email onto the right ghost beside Name. Save `pages-builder-l2.png`. Pass when the canvas shows two columns and a reload keeps that layout.
- [ ] Lane 3. Drag Email back to the left. Save `pages-builder-l3.png`. Pass when the right ghost is empty again.
- [ ] Lane 4. Drop the title onto the right. Save `pages-builder-l4.png`. Pass when the title sits in the right column.
- [ ] Lane 5. Drop the section image onto the left. Save `pages-builder-l5.png`. Pass when the image is a left block.
- [ ] Lane 6. Add a second field to a one-field page. Save `pages-builder-l6.png`. Pass when both fields show on the same canvas.
- [ ] Lane 7. Add a new page and put one field on it. Save `pages-builder-l7.png`. Pass when public next reaches that page.
- [ ] Lane 8. Set Transition to horizontal and open the public form. Save `pages-builder-l8.png`. Pass when the chevrons sit in a row.
- [ ] Lane 9. Confirm the Experience select is gone. Save `pages-builder-l9.png`. Pass when Settings has Transition and no Experience row.
- [ ] Lane 10. Open the onboarding template builder. Save `pages-builder-l10.png`. Pass when that mode shows the same page canvas.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from click of a page in the Content list to canvas paint of its blocks. Also measure a drag-end persist round trip.
- [ ] Probe. Time that click at trunk (one-question preview) and at head (page canvas). Time one drag-end PUT at head.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Canvas paint at head must stay under 300 ms. Drag-end persist must stay under 500 ms. Do not ratio the unlike trunk preview.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 8 screenshots into `docs/media/pages-builder-review-drop.png` and `docs/media/pages-builder-review-transition.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `docs/media/pages-builder-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends the PR to the stack. The operator lands it.

## Delete the old experience fork (pages-cleanup)

**Depends on.** pages-builder.

**Files.**

- [x] Edit `src/pages/Forms.tsx`.
- [ ] Edit `src/pages/FormBuilder.tsx`.
- [ ] Edit `src/lib/form-experience.ts`.
- [x] Edit `src/pages/Docs.tsx`.
- [x] Edit `README.md`.
- [x] Edit `worker/validation.ts`.
- [x] Edit `worker/mcp/tools/forms.ts`.
- [ ] Edit `shared/mcp-tools.ts`.
- [x] Edit `src/lib/api-reference.ts`.
- [ ] Edit `worker/index.ts` only if the onboarding default form still sends `type`.

**Build.**

- [ ] Delete `buildFocusedScreens`, `FormExperienceScreen`, and `sectionShowsFieldsTogether` once no caller remains.
- [ ] Stop sending `type` from the create dialog. Keep the column if a read still needs it. New forms write `single`.
- [ ] MCP `create_form` ignores `type`. Docs and OpenAPI say one step is one page. Run `bun run docs:check`.
- [ ] Document that a client that PATCHes only `steps/0` and omits `complete` can leave an exploded form `in_progress`.
- [ ] Delete Experience copy and the Layers grouped icon.
- [ ] Rewrite README and docs that say focused, grouped, or classic.

**You see.**

- [ ] `rg groupFields` and `rg buildFocusedScreens` print no app callers.
- [ ] The create dialog has no Experience field.
- [ ] Docs describe pages and transition only. One step is one page. `create_form` `type` is unused.
- [ ] OpenAPI and MCP copy warn that PATCH of only step 0 without `complete` can stay `in_progress` after explode.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/lib/form-pages.test.ts` still passes after the deletes. Run `bun test src/lib/form-pages.test.ts`.
- [x] Run `bun run docs:check` after the OpenAPI copy change.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Create a form and open its public URL at trunk and head. Save `pages-cleanup-l1.png`. Pass when head still creates a form and the public page loads.
- [ ] Lane 2. Open the create dialog. Save `pages-cleanup-l2.png`. Pass when Experience is absent.
- [ ] Lane 3. Open Section settings. Save `pages-cleanup-l3.png`. Pass when Show questions together is absent.
- [ ] Lane 4. Open README in the built docs or the repo preview. Save `pages-cleanup-l4.png`. Pass when the forms line names pages, not three presentations, and the API page says one step is one page.
- [ ] Lane 5. Submit a migrated Focused form. Save `pages-cleanup-l5.png`. Pass when the response stores every field.
- [ ] Lane 6. Submit a former Classic multi-step form. Save `pages-cleanup-l6.png`. Pass when each old step is still a page.
- [ ] Lane 7. MCP `create_form` without `type`, then again with `type` set to `multi_step`. Save `pages-cleanup-l7.png`. Pass when both forms are page forms and `type` is unused.
- [ ] Lane 8. Open an embed with `?embed=1`. Save `pages-cleanup-l8.png`. Pass when chrome flags still hide branding.
- [ ] Lane 9. Run `bun run lint`. Save `pages-cleanup-l9.png`. Pass when eslint exits 0.
- [ ] Lane 10. Run `bun run build`. Save `pages-cleanup-l10.png`. Pass when tsc and vite exit 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `bun run build` wall time at trunk and head.
- [ ] Probe. Run `bun run build` at trunk and at head.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head build must stay within 15 percent of trunk.

**Review gate.** None. pages-cleanup is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends the PR to the stack. The operator lands it.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No prototype ran. The product calls were locked in chat. Transition is per form. Layout is two independent stacks. Focused forms become one field per page.

Unproven feel. Drop on a 280 px list versus the center canvas. Two columns inside the 680 px booking card. Two columns stacking at `md` inside a narrow embed. First-GET explode time on a large Focused form.

## Appendix B. Alternatives rejected

Per-page transition. Rejected because the operator picked one form control.

Row pairing with `half` and `full`. Rejected because two stacks cover that drop and also hold title, rich text, and image.

A first-class `form_fields.width` column. Rejected because blocks are not only fields.

Mounting `FormExperience` inside the builder before a page canvas. Rejected because the canvas must edit in place.

Architect skipped. The column model and the transition scope were locked in chat. The remaining work is sequence, not a second shape.

## Appendix C. Risks

pages-migrate writes on GET. The owner watches idempotence and a failed explode that must not leave half-written steps.

`control-ui` is not on this machine. Live lanes use Cursor browser tools. That is a surface risk.

`pstack/` is not in this git repo. Owners read those skills from the Cursor plugin if `git show origin/main:pstack/...` fails.

This repo has no test script today. pages-model adds `bun test` on new files.

GET explode of a large Focused form can add latency. pages-migrate holds the 200 ms extra budget.

Booking at 680 px with two columns can clip. pages-runtime stacks columns at `md` and watches that card.

The booking iframe height uses `document.documentElement.scrollHeight` and does not shrink after a tall date step. That bug is already on trunk. pages-runtime does not fix it.

API clients that PATCH only `steps/0` and omit `complete` can stay `in_progress` after explode. pages-migrate does not rewrite `currentStepIndex` on those rows. pages-cleanup documents the break.

Historical `group-*` and `statement-*` keys do not join after pages. One-field pages keep `field-*`. Many-field pages use `step-*`. Classic step ids stay. Focused grouped and intro funnels are a new series.

## Appendix D. Links and reading list

Read `src/lib/form-experience.ts`, `src/lib/form-sections.ts`, `src/components/FormExperience.tsx`, `src/pages/FormBuilder.tsx`, `src/pages/Forms.tsx`, `src/pages/Onboarding.tsx`, `src/pages/PublicForm.tsx`, `src/pages/PublicBooking.tsx`, `src/lib/api-reference.ts`, `widget/form/index.ts`, `widget/booking/index.ts`, `shared/public-chrome.ts`, `shared/funnel-analytics.ts`, `worker/lib/form-analytics.ts`, `worker/services/form-service.ts`, `worker/lib/form-actions.ts`, `worker/mcp/tools/forms.ts`, and `worker/validation.ts` before pages-model.

pages-runtime and pages-builder get `pstack/skills/how/SKILL.md` at owner start. Skip `interrogate` unless a review-gated PR comes back with a second shape.

No `show-me-your-work` trail until the operator says go.

## Appendix E. Locked row refinement

The operator rejected two independent chrome+field stacks. Title, intro, and cover stay pinned above the canvas and are not droppable. Field layout is `pageLayout.rows` of `{ left, right }`. Builder rows are always two columns, with a ghost slot beside a solo field. Public solo rows stay full width. Legacy `{ left, right }` lists zip on read. Chrome kinds are dropped.
