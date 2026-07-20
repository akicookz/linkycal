# Merged Booking Details + URL Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an event type opt into collecting booker details (name/email/extra info) with its attached form instead of the built-in "Your Information" step, and wire URL prefill into the public booking page.

**Architecture:** A `collectDetailsWithForm` flag stored in the existing `eventTypes.settings` JSON column (no migration, no server changes — the column already round-trips through validation, service, and MCP). The public booking page skips step 2 when the flag is on and the form has name+email-mapped fields, rendering those fields inline in the form and forcing them required via a new `requiredFieldIds` input on the shared form-experience model. Prefill reuses `src/lib/form-prefill.ts` the same way the standalone form page does, plus reserved `name`/`email`/`notes` params for the built-in inputs.

**Tech Stack:** React SPA (`src/`), TanStack Query, Bun test runner, shared form-experience model in `src/lib/form-experience.ts`.

**Spec:** `docs/superpowers/specs/2026-07-20-booking-form-merged-details-design.md`

## Global Constraints

- `verbatimModuleSyntax` is on: type-only imports MUST use `import type` (or inline `type` specifiers) or `tsc -b` fails.
- The working tree has a pre-existing uncommitted change in `worker/index.ts` that is NOT part of this work. Never `git add -A` / `git add .` — always stage explicit file paths.
- Follow `AGENTS.md` conventions: function declarations (not arrow consts) for top-level functions, no gratuitous comments — comments only for non-obvious *why*.
- Tests use Bun's runner: `bun test <path>` for one file, `bun test` for all.
- UI copy: no em-dashes; toggle rows are card-style (`rounded-[12px] border px-4 py-3`) matching the existing "Require confirmation" row.
- Commit messages: conventional style (`feat:`, `test:`, `fix:`) matching recent history, plus the session's standard trailers.

---

### Task 1: Contact-mapping helpers in the form-experience model

**Files:**
- Modify: `src/lib/form-experience.ts` (append after `getAllFormFields`, around line 109)
- Test: `tests/form-experience.test.ts`

**Interfaces:**
- Consumes: existing `FormExperienceForm` type.
- Produces:
  - `interface ContactMappedFieldIds { nameFieldId?: string; emailFieldId?: string }`
  - `function getContactMappedFieldIds(form: FormExperienceForm): ContactMappedFieldIds` — first field with `contactMapping === "name"` / `"email"` wins.
  - `function shouldCollectDetailsWithForm(settings: unknown, form: FormExperienceForm | null | undefined): boolean` — true only when `settings` is an object with `collectDetailsWithForm === true` AND the form has both a name-mapped and an email-mapped field.

Tasks 4 and 6 import both functions by these exact names.

- [ ] **Step 1: Write the failing tests**

Append to `tests/form-experience.test.ts` (it already has `field()` and `form()` fixture helpers at the top — reuse them; add the two new function names to the existing import from `../src/lib/form-experience`):

```ts
describe("getContactMappedFieldIds", () => {
  test("returns the first name- and email-mapped field ids", () => {
    const model = form({
      steps: [
        {
          id: "s1",
          sortOrder: 0,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [
            field("full-name", { contactMapping: "name" }),
            field("work-email", { sortOrder: 1, contactMapping: "email" }),
            field("alt-email", { sortOrder: 2, contactMapping: "email" }),
          ],
        },
      ],
    });
    expect(getContactMappedFieldIds(model)).toEqual({
      nameFieldId: "full-name",
      emailFieldId: "work-email",
    });
  });

  test("returns empty object when nothing is mapped", () => {
    expect(getContactMappedFieldIds(form())).toEqual({});
  });
});

describe("shouldCollectDetailsWithForm", () => {
  const mappedForm = form({
    steps: [
      {
        id: "s1",
        sortOrder: 0,
        title: null,
        description: null,
        richDescription: null,
        settings: null,
        visibility: null,
        fields: [
          field("full-name", { contactMapping: "name" }),
          field("work-email", { sortOrder: 1, contactMapping: "email" }),
        ],
      },
    ],
  });

  test("true when flag is on and form maps name and email", () => {
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: true }, mappedForm),
    ).toBe(true);
  });

  test("false without a form", () => {
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: true }, null),
    ).toBe(false);
  });

  test("false when settings are missing or the flag is off", () => {
    expect(shouldCollectDetailsWithForm(null, mappedForm)).toBe(false);
    expect(shouldCollectDetailsWithForm(undefined, mappedForm)).toBe(false);
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: false }, mappedForm),
    ).toBe(false);
    expect(shouldCollectDetailsWithForm("yes", mappedForm)).toBe(false);
  });

  test("false when a mapping is missing", () => {
    const nameOnly = form({
      steps: [
        {
          id: "s1",
          sortOrder: 0,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [field("full-name", { contactMapping: "name" })],
        },
      ],
    });
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: true }, nameOnly),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/form-experience.test.ts`
Expected: FAIL — `getContactMappedFieldIds` / `shouldCollectDetailsWithForm` not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/form-experience.ts`, directly after `getAllFormFields` (line 109):

```ts
export interface ContactMappedFieldIds {
  nameFieldId?: string;
  emailFieldId?: string;
}

export function getContactMappedFieldIds(
  form: FormExperienceForm,
): ContactMappedFieldIds {
  const result: ContactMappedFieldIds = {};
  for (const step of form.steps) {
    for (const field of step.fields) {
      if (field.contactMapping === "name" && !result.nameFieldId) {
        result.nameFieldId = field.id;
      }
      if (field.contactMapping === "email" && !result.emailFieldId) {
        result.emailFieldId = field.id;
      }
    }
  }
  return result;
}

export function shouldCollectDetailsWithForm(
  settings: unknown,
  form: FormExperienceForm | null | undefined,
): boolean {
  if (!form) return false;
  if (typeof settings !== "object" || settings === null) return false;
  if ((settings as Record<string, unknown>).collectDetailsWithForm !== true) {
    return false;
  }
  const mapped = getContactMappedFieldIds(form);
  return !!mapped.nameFieldId && !!mapped.emailFieldId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/form-experience.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/form-experience.ts tests/form-experience.test.ts
git commit -m "feat: add contact-mapping helpers to form experience model"
```

---

### Task 2: `requiredFieldIds` override in the form-experience model

**Files:**
- Modify: `src/lib/form-experience.ts` (`BuildFormExperienceModelInput` at line ~92, `buildFormExperienceModel` steps construction at line ~238)
- Modify: `src/components/FormExperience.tsx` (props at line ~62, destructure at ~126, model memo at ~151)
- Test: `tests/form-experience.test.ts`

**Interfaces:**
- Consumes: existing `buildFormExperienceModel`.
- Produces:
  - `BuildFormExperienceModelInput` gains `requiredFieldIds?: ReadonlySet<string>` — every listed field that survives visibility/exclusion filtering is emitted into `model.steps` (and therefore `model.screens` and checkpoints) with `required: true`.
  - `FormExperienceProps` gains `requiredFieldIds?: ReadonlySet<string>`, forwarded verbatim to `buildFormExperienceModel`.

Task 4 passes `requiredFieldIds` to both `buildFormExperienceModel` and `<FormExperience>`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("buildFormExperienceModel", ...)` block in `tests/form-experience.test.ts`:

```ts
  test("requiredFieldIds forces matching fields required in steps and screens", () => {
    const model = buildFormExperienceModel({
      form: form(),
      values: {},
      surface: "booking",
      requiredFieldIds: new Set(["first"]),
    });

    const first = model.steps[0]?.fields.find((f) => f.id === "first");
    const second = model.steps[0]?.fields.find((f) => f.id === "second");
    expect(first?.required).toBe(true);
    expect(second?.required).toBe(false);

    const screen = model.screens.find(
      (s) => s.kind === "question" && s.field.id === "first",
    );
    expect(screen?.kind === "question" && screen.field.required).toBe(true);
  });

  test("requiredFieldIds does not resurrect excluded fields", () => {
    const model = buildFormExperienceModel({
      form: form(),
      values: {},
      surface: "booking",
      excludedFieldIds: new Set(["first"]),
      requiredFieldIds: new Set(["first"]),
    });
    expect(
      model.steps.flatMap((s) => s.fields).some((f) => f.id === "first"),
    ).toBe(false);
  });
```

(The `form()` fixture's fields `first`/`second` are created with `required: false`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/form-experience.test.ts`
Expected: FAIL — first new test: `expect(first?.required).toBe(true)` receives `false`. (TS may also error on the unknown input property; that counts as the failing state.)

- [ ] **Step 3: Implement the override**

In `src/lib/form-experience.ts`:

Add to `BuildFormExperienceModelInput`:

```ts
export interface BuildFormExperienceModelInput {
  form: FormExperienceForm;
  values: Record<string, string>;
  surface: "standalone" | "booking";
  excludedFieldIds?: ReadonlySet<string>;
  requiredFieldIds?: ReadonlySet<string>;
}
```

In `buildFormExperienceModel`, next to the existing `excludedFieldIds` default (line ~209):

```ts
  const requiredFieldIds = input.requiredFieldIds ?? new Set<string>();
```

Then extend the steps construction (currently `.sort(...).filter(...)` at lines ~241-256) with a trailing `.map`:

```ts
  const steps = conditionallyVisibleSteps
    .map<VisibleFormExperienceStep>((step) => ({
      ...step,
      fields: [...step.fields]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter(
          (currentField) =>
            currentField.type !== "completion" &&
            isFieldVisible(
              {
                id: currentField.id,
                type: currentField.type,
                options: currentField.options,
                visibility: currentField.visibility ?? null,
              },
              conditionInputs,
            ) &&
            !excludedFieldIds.has(currentField.id),
        )
        .map((currentField) =>
          requiredFieldIds.has(currentField.id) && !currentField.required
            ? { ...currentField, required: true }
            : currentField,
        ),
    }))
    .filter((step) => step.fields.length > 0);
```

In `src/components/FormExperience.tsx`:

Add `requiredFieldIds?: ReadonlySet<string>;` to `FormExperienceProps` (after `excludedFieldIds`), add `requiredFieldIds,` to the destructuring in `FormExperience`, and thread it through the model memo:

```ts
  const model = useMemo(
    () =>
      buildFormExperienceModel({
        form,
        values,
        surface,
        excludedFieldIds,
        requiredFieldIds,
      }),
    [form, values, surface, excludedFieldIds, requiredFieldIds],
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/form-experience.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/form-experience.ts src/components/FormExperience.tsx tests/form-experience.test.ts
git commit -m "feat: support forcing fields required in form experience model"
```

---

### Task 3: `buildBookingPrefill` in the prefill lib

**Files:**
- Modify: `src/lib/form-prefill.ts` (append at end)
- Test: `tests/worker/form-prefill.test.ts`

**Interfaces:**
- Consumes: existing `prefillFromQuery`, `FormPrefillField`, `FormPrefillQuery`, and the module-private `firstValue`.
- Produces:

```ts
export interface BookingPrefillInput {
  fields: FormPrefillField[];
  query: FormPrefillQuery;
  nameFieldId?: string;
  emailFieldId?: string;
}

export interface BookingPrefill {
  formValues: Record<string, string>;
  guestName?: string;
  guestEmail?: string;
  guestNotes?: string;
}

export function buildBookingPrefill(input: BookingPrefillInput): BookingPrefill
```

Rules (from the spec): `formValues` comes from `prefillFromQuery` keyed by field id. Reserved params `name` / `email` / `notes` seed the guest values ONLY when no form field carries that exact id (field-id keys win on collision). A prefilled mapped field takes precedence over the reserved param for `guestName`/`guestEmail`. Whitespace-only reserved values are ignored. Task 5 imports `buildBookingPrefill` by this exact name.

- [ ] **Step 1: Write the failing tests**

Append to `tests/worker/form-prefill.test.ts` (reuse its existing `textField()` helper; add `buildBookingPrefill` to the import):

```ts
describe("buildBookingPrefill", () => {
  test("fills form values by field id and guests from reserved params", () => {
    const result = buildBookingPrefill({
      fields: [textField("company")],
      query: {
        company: "Acme",
        name: "Ada Lovelace",
        email: "ada@example.com",
        notes: "Runs late",
      },
    });
    expect(result.formValues).toEqual({ company: "Acme" });
    expect(result.guestName).toBe("Ada Lovelace");
    expect(result.guestEmail).toBe("ada@example.com");
    expect(result.guestNotes).toBe("Runs late");
  });

  test("a form field with a reserved id wins the collision", () => {
    const result = buildBookingPrefill({
      fields: [textField("name")],
      query: { name: "Ada Lovelace" },
    });
    expect(result.formValues).toEqual({ name: "Ada Lovelace" });
    expect(result.guestName).toBeUndefined();
  });

  test("a mapped field that collides with a reserved id still seeds the guest", () => {
    const result = buildBookingPrefill({
      fields: [textField("name")],
      query: { name: "Ada Lovelace" },
      nameFieldId: "name",
    });
    expect(result.guestName).toBe("Ada Lovelace");
  });

  test("prefilled mapped fields seed guests and beat reserved params", () => {
    const result = buildBookingPrefill({
      fields: [textField("full-name"), textField("work-email", { type: "email" })],
      query: {
        "full-name": "Grace Hopper",
        "work-email": "grace@example.com",
        name: "Someone Else",
      },
      nameFieldId: "full-name",
      emailFieldId: "work-email",
    });
    expect(result.guestName).toBe("Grace Hopper");
    expect(result.guestEmail).toBe("grace@example.com");
  });

  test("blank reserved params are ignored", () => {
    const result = buildBookingPrefill({
      fields: [],
      query: { name: "   ", notes: "" },
    });
    expect(result.guestName).toBeUndefined();
    expect(result.guestNotes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/worker/form-prefill.test.ts`
Expected: FAIL — `buildBookingPrefill` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/form-prefill.ts`:

```ts
export interface BookingPrefillInput {
  fields: FormPrefillField[];
  query: FormPrefillQuery;
  nameFieldId?: string;
  emailFieldId?: string;
}

export interface BookingPrefill {
  formValues: Record<string, string>;
  guestName?: string;
  guestEmail?: string;
  guestNotes?: string;
}

export function buildBookingPrefill(input: BookingPrefillInput): BookingPrefill {
  const { fields, query, nameFieldId, emailFieldId } = input;
  const formValues = prefillFromQuery(fields, query);
  const fieldIds = new Set(fields.map((field) => field.id));

  function reserved(key: string): string | undefined {
    if (fieldIds.has(key)) return undefined;
    const value = firstValue(query[key]);
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  const guestName =
    (nameFieldId ? formValues[nameFieldId] : undefined) ?? reserved("name");
  const guestEmail =
    (emailFieldId ? formValues[emailFieldId] : undefined) ?? reserved("email");

  return {
    formValues,
    guestName,
    guestEmail,
    guestNotes: reserved("notes"),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/worker/form-prefill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/form-prefill.ts tests/worker/form-prefill.test.ts
git commit -m "feat: add booking prefill builder with reserved guest params"
```

---

### Task 4: Merged details flow on the public booking page

**Files:**
- Modify: `src/pages/PublicBooking.tsx`

No new unit tests: this task is wiring already-tested units into a page component; page components have no test harness in this repo. Verification is the full suite + typecheck.

**Interfaces:**
- Consumes: `getContactMappedFieldIds`, `shouldCollectDetailsWithForm` (Task 1); `requiredFieldIds` on `buildFormExperienceModel` and `<FormExperience>` (Task 2).
- Produces: nothing consumed by later tasks; Task 5 edits the same file afterward.

- [ ] **Step 1: Add `settings` to the page's EventType type and import the helpers**

In `src/pages/PublicBooking.tsx`, extend the `EventType` interface (line ~57):

```ts
interface EventType {
  id: string;
  name: string;
  slug: string;
  duration: number;
  description: string | null;
  location: string | null;
  color: string;
  settings?: { collectDetailsWithForm?: boolean } | null;
}
```

Extend the existing `@/lib/form-experience` import (line ~37) to:

```ts
import {
  buildFormExperienceModel,
  getContactMappedFieldIds,
  shouldCollectDetailsWithForm,
  type ContactMappedFieldIds,
  type FormExperienceForm,
} from "@/lib/form-experience";
```

(The public endpoint returns the full event-type row, so `settings` is already present in the JSON; only the type was missing.)

- [ ] **Step 2: Compute mergeDetails and the field-id sets**

Replace the `mappedFields` memo (lines ~304-313, the inline loop over `formSteps`) and the now-unused `const formSteps = bookingForm?.steps ?? [];` (line ~302) with:

```ts
  const mappedFields = useMemo<ContactMappedFieldIds>(
    () => (bookingForm ? getContactMappedFieldIds(bookingForm) : {}),
    [bookingForm],
  );

  const mergeDetails = useMemo(
    () => shouldCollectDetailsWithForm(eventType?.settings, bookingForm),
    [eventType?.settings, bookingForm],
  );
```

Keep the existing `mappedFieldIds` memo as-is, and add after it:

```ts
  const excludedFieldIds = mergeDetails ? EMPTY_FIELD_ID_SET : mappedFieldIds;
  const requiredFieldIds = mergeDetails ? mappedFieldIds : undefined;
```

with a module-level constant next to the other module constants (near `DAYS`, line ~81):

```ts
const EMPTY_FIELD_ID_SET: ReadonlySet<string> = new Set();
```

Update the `bookingFormModel` memo (line ~322) to use the new sets:

```ts
  const bookingFormModel = useMemo(
    () =>
      bookingForm
        ? buildFormExperienceModel({
            form: bookingForm,
            values: formValues,
            surface: "booking",
            excludedFieldIds,
            requiredFieldIds,
          })
        : null,
    [bookingForm, formValues, excludedFieldIds, requiredFieldIds],
  );
```

- [ ] **Step 3: Skip step 2 when merged**

Step 1's bottom-nav button (line ~977-985): change `onClick={() => setStep(2)}` to:

```ts
                    onClick={() => setStep(mergeDetails ? 3 : 2)}
```

- [ ] **Step 4: Extract the honeypot and hand it to the form step**

The hidden spam input currently lives only in step 2's markup (lines ~1006-1017). Just above the `return` of the component (near the `primaryStyle` definitions is fine), add:

```tsx
  const honeypotInput = (
    <div className="sr-only" aria-hidden="true">
      <label htmlFor="website">Website</label>
      <input
        id="website"
        type="text"
        name="website"
        autoComplete="url"
        tabIndex={-1}
        value={spamField}
        onChange={(e) => setSpamField(e.target.value)}
      />
    </div>
  );
```

Replace the inline `<div className="sr-only" ...>...</div>` block inside step 2 with `{honeypotInput}`. (Steps 2 and 3 are mutually exclusive renders, so the duplicated `id="website"` never coexists.)

- [ ] **Step 5: Update the FormExperience call for merged mode**

Replace the step-3 block (line ~1093-1107) with:

```tsx
          {step === 3 && bookingForm && (
            <FormExperience
              form={bookingForm}
              surface="booking"
              values={formValues}
              excludedFieldIds={excludedFieldIds}
              requiredFieldIds={requiredFieldIds}
              submitting={submitting}
              error={bookingError}
              theme={theme}
              honeypot={honeypotInput}
              onValueChange={setBookingFormValue}
              onClearFields={clearBookingFormFields}
              onCheckpoint={checkpointBookingForm}
              onExitBack={() => {
                if (mergeDetails) {
                  setStep(1);
                  if (isMobile) goMobileSubStep("time");
                } else {
                  setStep(2);
                }
              }}
            />
          )}
```

Everything else stays: `setBookingFormValue` already mirrors mapped-field edits into `guestName`/`guestEmail` (line ~502), `handleBook` already merges them into `formFields`, and with merged mode `guestNotes` stays `""` so `notes` is omitted from the payload (`guestNotes || undefined`).

- [ ] **Step 6: Verify**

Run: `bun test`
Expected: PASS (full suite).

Run: `bun run build`
Expected: completes with no type errors.

Run: `bun run lint`
Expected: clean (no new warnings in the touched files).

- [ ] **Step 7: Commit**

```bash
git add src/pages/PublicBooking.tsx
git commit -m "feat: collect booker details with the attached form when enabled"
```

---

### Task 5: URL prefill on the public booking page

**Files:**
- Modify: `src/pages/PublicBooking.tsx`

**Interfaces:**
- Consumes: `buildBookingPrefill`, `parseQueryString` from `@/lib/form-prefill` (Task 3); `getAllFormFields` from `@/lib/form-experience`; `mappedFields` from Task 4.
- Produces: nothing consumed later.

- [ ] **Step 1: Add imports**

```ts
import { buildBookingPrefill, parseQueryString } from "@/lib/form-prefill";
```

and add `getAllFormFields` to the `@/lib/form-experience` import list.

- [ ] **Step 2: Seed state once from the URL**

Directly after the `mergeDetails` memo added in Task 4, add (mirrors the once-per-load pattern in `PublicForm.tsx:178`):

```ts
  const didPrefill = useRef(false);
  useEffect(() => {
    if (!data) return;
    if (didPrefill.current) return;
    didPrefill.current = true;

    const fields = bookingForm ? getAllFormFields(bookingForm) : [];
    const prefill = buildBookingPrefill({
      fields: fields.map((field) => ({
        id: field.id,
        type: field.type,
        options: field.options,
      })),
      query: parseQueryString(window.location.search),
      nameFieldId: mappedFields.nameFieldId,
      emailFieldId: mappedFields.emailFieldId,
    });

    if (Object.keys(prefill.formValues).length > 0) {
      setFormValues((previous) => ({ ...prefill.formValues, ...previous }));
    }
    const { guestName: seededName, guestEmail: seededEmail, guestNotes: seededNotes } = prefill;
    if (seededName) setGuestName((previous) => previous || seededName);
    if (seededEmail) setGuestEmail((previous) => previous || seededEmail);
    if (seededNotes) setGuestNotes((previous) => previous || seededNotes);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
```

Why this is enough for both modes: seeding `guestName`/`guestEmail` triggers the existing sync effect (line ~361) that mirrors them into the mapped form fields, so in merged mode the values appear inside the form inputs the booker actually sees; in unmerged mode they appear in the built-in step. A field-id param on a mapped field flows the other way via `buildBookingPrefill`'s precedence rule.

- [ ] **Step 3: Verify**

Run: `bun test`
Expected: PASS.

Run: `bun run build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicBooking.tsx
git commit -m "feat: prefill booking page from URL params"
```

---

### Task 6: "Collect details with this form" toggle in the event type editor

**Files:**
- Modify: `src/pages/EventTypeForm.tsx`

**Interfaces:**
- Consumes: `getContactMappedFieldIds`, `FormExperienceForm` type (Task 1); existing `GET /api/projects/:projectId/forms/:formId` returning `{ form }` with steps+fields (fields include `contactMapping`).
- Produces: `settings: { ...existing, collectDetailsWithForm: boolean }` in the create/update payloads. The server already accepts and stores it verbatim.

- [ ] **Step 1: Extend types and state**

Add the import:

```ts
import {
  getContactMappedFieldIds,
  type FormExperienceForm,
} from "@/lib/form-experience";
```

Add to the `EventType` interface (line ~55-71): `settings?: Record<string, unknown> | null;`

Add to `EventTypeFormData` (line ~95-109): `collectDetailsWithForm: boolean;`

Add to `defaultFormData` (line ~179-191): `collectDetailsWithForm: false,`

In the populate-from-fetch `useLayoutEffect` (line ~400-414), add to the `setFormData({...})` object:

```ts
      collectDetailsWithForm: et.settings?.collectDetailsWithForm === true,
```

- [ ] **Step 2: Fetch the selected form's definition**

After the `projectForms` query (line ~268-277), add:

```ts
  const { data: selectedFormData } = useQuery<{ form: FormExperienceForm }>({
    queryKey: ["projects", projectId, "forms", formData.bookingFormId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formData.bookingFormId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch form");
      return res.json();
    },
    enabled: !!projectId && !!formData.bookingFormId,
  });

  const selectedForm =
    formData.bookingFormId && selectedFormData ? selectedFormData.form : null;
  const selectedFormMapping = selectedForm
    ? getContactMappedFieldIds(selectedForm)
    : null;
  const canCollectDetailsWithForm =
    !!selectedFormMapping?.nameFieldId && !!selectedFormMapping?.emailFieldId;
```

- [ ] **Step 3: Render the toggle**

Inside the Booking Form block (the `space-y-2` div, line ~1063-1093), after the existing hint `<p>` ("Attach a form to collect additional information during booking."), add:

```tsx
                {formData.bookingFormId && canCollectDetailsWithForm && (
                  <div className="flex items-center justify-between rounded-[12px] border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">Collect details with this form</p>
                      <p className="text-xs text-muted-foreground">
                        Skips the built-in info step, the form collects the booker's name and email instead
                      </p>
                    </div>
                    <Switch
                      checked={formData.collectDetailsWithForm}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          collectDetailsWithForm: checked,
                        }))
                      }
                    />
                  </div>
                )}
                {formData.bookingFormId && selectedForm && !canCollectDetailsWithForm && (
                  <p className="text-[11px] text-muted-foreground">
                    Map a name and an email field on this form to collect booker details with it.
                  </p>
                )}
```

(`Switch` is already imported; it powers the "Require confirmation" row.)

- [ ] **Step 4: Build the save payload with merged settings**

Add near the mutations:

```ts
type EventTypeSavePayload = Omit<EventTypeFormData, "collectDetailsWithForm"> & {
  settings: Record<string, unknown>;
};
```

Change both mutation signatures from `async (data: EventTypeFormData)` to `async (data: EventTypeSavePayload)` (bodies unchanged — they `JSON.stringify(data)` either way).

Replace `handleSubmit` (line ~685-692) with:

```ts
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { collectDetailsWithForm, ...rest } = formData;
    const existingSettings = eventTypeData?.eventType?.settings ?? {};
    const keepFlag =
      collectDetailsWithForm &&
      !!formData.bookingFormId &&
      (selectedForm ? canCollectDetailsWithForm : true);
    const payload: EventTypeSavePayload = {
      ...rest,
      settings: { ...existingSettings, collectDetailsWithForm: keepFlag },
    };
    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }
```

Why `selectedForm ? canCollectDetailsWithForm : true`: the flag is only forced off when the form definition has actually loaded and lacks a mapping. If the user saves before the form query resolves, the stored value is preserved instead of silently wiped. Spreading `existingSettings` preserves any other keys API users may have stored in `settings`.

- [ ] **Step 5: Verify**

Run: `bun test`
Expected: PASS.

Run: `bun run build`
Expected: no type errors.

Run: `bun run lint`
Expected: clean for the touched file.

- [ ] **Step 6: Commit**

```bash
git add src/pages/EventTypeForm.tsx
git commit -m "feat: add collect-details-with-form toggle to event type editor"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: PASS, zero failures.

- [ ] **Step 2: Typecheck + build**

Run: `bun run build`
Expected: `cf-typegen`, `tsc -b`, and `vite build` all succeed.

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: no errors.

- [ ] **Step 4: Optional manual smoke test**

`bun run dev` (note: dev hits remote prod D1, ~8.5s/request is normal). In a project with a form that has name+email-mapped fields: attach it to an event type, enable the toggle, open the public booking link. Confirm: date/time goes straight to the form, name/email render inside it as required, booking submits. Then open the link with `?<fieldId>=value&name=Ada&email=ada@example.com` and confirm prefill. Do not create bookings against real calendars beyond what's needed; delete test bookings after.

If anything fails here, fix before reporting done — do not skip.
