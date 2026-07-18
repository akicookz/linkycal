# Shared form experience for standalone and booking forms

**Date:** 2026-07-17
**Status:** Approved; implementation plan: `docs/superpowers/plans/2026-07-17-shared-form-experience.md`

## Problem

Standalone public forms and forms attached to bookings use the same persisted form,
step, and field data, but the two public pages render that data with separate
frontend orchestration.

`PublicForm` supports the complete classic and focused experiences. Its focused
behavior includes statement screens, one-question screens, grouped-question
screens, conditional visibility, validation, progress, keyboard navigation,
choice auto-advance, section imagery, file inputs, and step checkpoints.

`PublicBooking` receives the attached form's `type` and full steps/fields, but it
never reads `bookingForm.type`. It always creates one booking screen per form step
and maps every field in that step through `FormFieldRenderer`. Consequently, a
focused form becomes step-based rather than one-question-at-a-time when attached
to a booking.

The submission path is not the cause. The booking page already keeps attached-form
answers in `formValues`, merges mapped name/email values, and sends the result as
`formFields` in the final `/api/v1/bookings` request. The backend creates the form
response and links it to the new booking. No booking is created before the attached
form is complete.

The divergence is historical: attached booking forms predate the focused public
form experience, and the focused controller was implemented inside `PublicForm`
instead of as a reusable component.

## Goals

1. Use one shared `FormExperience` component for standalone public forms and forms
   attached to bookings.
2. Honor `form.type` in both hosts: `single` uses the classic experience and
   `multi_step` uses the focused experience.
3. Preserve standalone public forms pixel-for-pixel and behavior-for-behavior.
4. Preserve the booking sequence: date/time, basic details, attached form, then one
   final booking request and booking confirmation.
5. Keep form values controlled by each host and keep persistence outside the shared
   presentation component.
6. Eliminate duplicated form navigation, visibility, validation, and focused-screen
   behavior so future form changes apply to both hosts.

## Non-goals

- Changing the database schema or worker API.
- Creating or reserving a booking before the attached form is completed.
- Changing standalone response, upload, analytics, completion, redirect, theming,
  or embed behavior.
- Changing the existing classic attached-booking appearance.
- Solving the existing attached-booking file-upload limitation. Standalone file
  uploads must continue working unchanged; booking upload parity requires a
  separate response/upload lifecycle design.
- Changing booking availability semantics. The backend continues to recheck the
  selected slot when the final booking request is made.

## Decisions

1. **One shared component:** both `PublicForm` and `PublicBooking` render
   `FormExperience`; neither page implements its own form screen controller.
2. **Controlled data:** hosts own values and files. `FormExperience` receives them
   with change callbacks, so moving between hosts or surfaces cannot silently reset
   respondent answers.
3. **Injected persistence:** the shared component emits awaited checkpoints. The
   standalone host persists a response step; the booking host keeps intermediate
   checkpoints local and creates the booking only at final completion.
4. **Surface-specific outer presentation:** one component supports a standalone
   surface and a booking surface. The standalone surface preserves its current DOM,
   classes, dimensions, animations, theme behavior, and navigation. The booking
   surface stays inside the existing booking card and preserves the current classic
   layout.
5. **Mapped-field exclusion is display-only:** booking-mapped name/email fields are
   omitted from attached-form screens because the booking basics screen already
   collects them. They remain in the full field registry and value map so conditions
   can reference them, and they are merged into `formFields` before submission.
6. **No duplicated quick patch:** copying focused logic into `PublicBooking` is
   rejected because it would preserve the source of the regression.

## Architecture

```text
PublicForm
  - fetch form/project
  - own values, files, response ID and standalone errors
  - own response creation, file upload, analytics and completion/redirect
  - render FormExperience(surface="standalone")
        |
        +-- checkpoint -> submitStepValues(stepIndex, isFinal)

PublicBooking
  - fetch event type and attached form
  - own date/time, basics, form values and booking errors
  - render FormExperience(surface="booking") after basics
        |
        +-- intermediate checkpoint -> resolve true without network work
        +-- final checkpoint -> handleBook()

FormExperience
  - normalize steps and fields
  - evaluate step/field visibility
  - build classic steps or focused screens
  - validate visible fields
  - own presentation navigation and transition state
  - render current surface
  - await host checkpoints before advancing/completing
```

### Shared form model and pure helpers

Add shared form-experience types covering the existing public form fields and steps,
including `settings`, `visibility`, `validation`, `options`, and `contactMapping`.
Both pages must consume these shared types instead of maintaining narrower local
interfaces.

Pure helpers derive:

- sorted non-completion steps;
- the complete field registry used by conditions;
- visible steps and fields for the current value map;
- focused screens (`statement`, `question`, and `group`);
- question numbers and section associations;
- the final list of display fields after applying `excludedFieldIds`.

Exclusion happens after the full condition registry is created. A hidden mapped
field can therefore still drive another field's visibility.

### `FormExperience` component

The controlled component receives:

```ts
interface FormExperienceProps {
  form: FormExperienceForm;
  surface: "standalone" | "booking";
  values: Record<string, string>;
  files?: Record<string, File | null>;
  excludedFieldIds?: ReadonlySet<string>;
  submitting: boolean;
  error: string | null;
  theme?: FormExperienceTheme;
  canHideBranding?: boolean;
  onValueChange: (fieldId: string, value: string) => void;
  onFileChange?: (fieldId: string, file: File | null) => void;
  onCheckpoint: (checkpoint: {
    stepIndex: number;
    isFinal: boolean;
  }) => Promise<boolean>;
}
```

The exact shared type names may be colocated with the component, but both hosts must
use the same definitions. The component owns only presentation state:

- classic step index;
- focused screen index and navigation direction;
- field validation errors;
- choice auto-advance timer;
- synchronous transition lock;
- latest callback/value refs needed by global keyboard handling.

It does not fetch data, create response IDs, upload files, create bookings, capture
analytics, or render either host's success state.

### Standalone adapter

`PublicForm` retains its existing query and lifecycle state. Its value and file
callbacks continue to update the existing controlled maps. `FormExperience` clears
its internal validation error for a field before forwarding that field's change to
the host. The standalone checkpoint adapter calls the existing
`submitStepValues(stepIndex, isFinal)` and returns that method's boolean result.

The standalone surface must preserve:

- classic and focused markup and Tailwind classes;
- `PageShell`, `FocusedShell`, section media, progress, and branding behavior;
- exact button labels and loading icons;
- keyboard shortcuts and 350 ms choice auto-advance;
- conditional step and field visibility;
- hidden-value cleanup;
- section statement/group behavior;
- file selection and upload order;
- response creation and per-step persistence timing;
- completion screen and redirect timing;
- embed height messaging, SEO, theme application, and analytics.

Moving code into the shared component must not intentionally redesign, clean up, or
otherwise alter standalone output.

### Booking adapter

`PublicBooking` retains steps 1 and 2 for date/time and basic details. When an
attached form has display questions, the next action mounts `FormExperience` with:

- `form={bookingForm}`;
- `surface="booking"`;
- controlled `formValues`;
- `excludedFieldIds={mappedFieldIds}`;
- the booking theme;
- a checkpoint adapter that returns `true` for non-final checkpoints and awaits
  `handleBook()` for the final checkpoint.

`handleBook()` must return `Promise<boolean>` so the shared component advances only
after a successful booking. On failure it returns `false`, leaves the respondent on
the final question, preserves all answers, and displays `bookingError`.

When no attached display questions remain after mapped-field exclusion, the basics
screen continues to invoke `handleBook()` directly. After a successful attached
form completion, the booking page renders its existing confirmed/pending state.

For `bookingForm.type === "single"`, the booking surface must preserve the existing
one-screen-per-form-section behavior and field appearance. For
`bookingForm.type === "multi_step"`, it uses the same statement/question/group
screen derivation and focused input behavior as the standalone surface, while
remaining inside the booking card.

## Error and concurrency behavior

`FormExperience` awaits `onCheckpoint` before changing its step or screen. A
`false` result means the host failed to persist or complete; navigation remains on
the current screen and values remain intact.

A synchronous ref lock guards transitions before any awaited work begins. This is
required because React state alone does not synchronously prevent a rapid click,
Enter press, and choice auto-advance callback from entering the same transition in
one render. The lock is released in `finally`.

The component must also:

- clear an existing auto-advance timer before manual next/back navigation;
- clear the timer and remove keyboard listeners on unmount;
- use latest-closure refs for values, the current screen, and navigation callbacks;
- clamp classic and focused indices when conditional visibility removes later
  content;
- remove values/files for fields that become hidden, matching current standalone
  behavior;
- ignore completion fields when building respondent input screens;
- validate only currently visible display fields;
- keep the booking confirmation unreachable until `handleBook()` succeeds.

The backend remains the final authority for slot availability. A slot can become
unavailable while the respondent completes the attached form; the booking error is
shown without losing their answers.

## Testing strategy

Implementation follows test-driven development.

### Pure helper tests

Add focused fixtures covering:

- step and field ordering;
- completion-step exclusion;
- statement screens for meaningful section introductions;
- suppression of legacy default `Step N` / `Section N` titles;
- one question per screen for focused forms;
- grouped questions when `settings.groupFields === true`;
- correct question numbering across statements and groups;
- step and field conditional visibility;
- mapped-field display exclusion without removing it from condition inputs;
- screen changes when answers alter conditional visibility.

### Transition/controller tests

Test the presentation state independently from network code:

- required and email validation block advancement;
- a successful checkpoint advances exactly once;
- a failed checkpoint remains on the current screen;
- final completion invokes the callback exactly once;
- rapid duplicate next signals share the transition lock;
- manual navigation cancels pending choice auto-advance;
- back navigation preserves controlled values;
- index clamping selects a valid screen after visibility changes.

### Standalone regression verification

Before integrating bookings, migrate `PublicForm` and verify:

- classic form rendering and multi-section navigation;
- focused statement, question, group, and completion screens;
- conditional steps/fields and hidden-value cleanup;
- Enter, arrow, letter shortcuts, and choice auto-advance;
- file selection/upload and failed-upload retention;
- per-step API request order and single response creation;
- completion redirect timing;
- standalone and embedded layouts at desktop and mobile sizes;
- section image layouts and project theme overrides.

Screens and interactions must be visually compared against the pre-refactor page.
The acceptance criterion is pixel-identical and behavior-identical output, not an
approximation.

### Booking verification

Verify:

- no attached form: existing date/time -> basics -> booking flow;
- classic attached form: existing presentation and final payload unchanged;
- focused attached form: basics followed by statement/question/group screens;
- mapped name/email fields are skipped visually and included in `formFields`;
- conditions can depend on mapped and previously answered fields;
- final submission with an answered attached-form field creates exactly one booking
  and one linked form response;
- booking failure leaves the respondent on the final screen with answers intact;
- confirmed and pending confirmation states remain unchanged;
- double click/Enter/auto-advance cannot create duplicate booking requests;
- embedded and mobile booking layouts remain functional.

### Required commands

- Run focused unit tests during each extraction step with `bun test` and exact test
  paths from the implementation plan.
- Run `bun test` for the full suite.
- Run `bun run lint`.
- Run `bun run build`.
- Use the in-app browser for standalone and booking regression verification.

## Migration sequence

1. Add pure shared form-model and screen-building helpers with failing tests first.
2. Add the controlled `FormExperience` component and transition protections with
   failing tests first.
3. Migrate `PublicForm` only. Verify standalone parity before changing booking code.
4. Migrate the existing classic attached-booking flow to the shared component and
   verify no booking regression.
5. Enable the focused booking surface based on `bookingForm.type` and verify the
   complete booking/form-response data path.
6. Run full automated and browser verification.

Each migration stage is independently reviewable and reversible. The existing
unstaged formatting-only change in `worker/index.ts` must remain untouched.

## Acceptance criteria

- `PublicForm` and `PublicBooking` both use `FormExperience`.
- `PublicBooking` reads and honors `bookingForm.type` at runtime.
- Standalone classic and focused forms are pixel-identical and behavior-identical to
  the pre-refactor implementation.
- Existing classic booking forms are visually and behaviorally unchanged.
- Focused booking forms present one question per screen, except explicitly grouped
  sections.
- Booking basics remain before the attached form.
- No booking is created until the attached form completes.
- The final request contains all mapped and attached-form values.
- Successful submission with attached-form field values creates one booking linked
  to one completed form response, matching the existing backend contract.
- Failed submission preserves values and remains on the final form screen.
- Duplicate user signals cannot produce overlapping checkpoint or booking requests.
- No database, worker API, or backend booking changes are required.
- All automated checks and browser regression checks pass.
