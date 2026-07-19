# NLP Next Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace form-like Next Action creation with a deterministic one-sentence composer that extracts an action and exact deadline, previews every assumption, and preserves structured editing as a fallback.

**Architecture:** An application-owned parser wrapper lazy-loads `chrono-node/en`, normalizes LinkyCal-specific business phrases, and returns a discriminated result independent of Chrono's types. A focused `NextActionComposer` owns parsing and correction UI while `ContactDetail.tsx` retains only mutation and saved-card responsibilities. Existing storage and API contracts remain unchanged.

**Tech Stack:** React 19, TypeScript strict mode, Bun test runner, Tailwind CSS v4, shadcn/ui, `chrono-node@2.10.0`, Happy DOM, React Testing Library.

**Design specification:** `docs/superpowers/specs/2026-07-19-next-action-nlp-design.md`

## Global Constraints

- Use Bun for dependency installation and every project command.
- Use function declarations for named functions and React components.
- Import only `chrono-node/en` at runtime, through dynamic `import()`, so other locales never enter the dashboard bundle.
- Parsing is deterministic and browser-side; do not call an LLM or worker endpoint.
- Explicit timezones win; otherwise use the browser IANA timezone, falling back to UTC.
- A date without an explicit time resolves to 5:00 PM and must display **time assumed**.
- `EST` and `PST` are fixed offsets; `ET` and `PT` are daylight-aware.
- The exact phrase `by next week Friday` must work.
- Do not save missing, ambiguous, or past deadlines.
- Preserve the existing `{ text, deadline }` REST payload and current contact schema.
- All buttons retain icon plus text, all interactive hit areas are at least 40px, and no divider borders are introduced.
- Preserve unrelated dirty-worktree changes; stage only files named by the active task.

## File Structure

### Create

- `src/lib/next-action-parser.ts` — normalization, Chrono loading, action extraction, timezone resolution, default-time rules, and parse-result types.
- `src/lib/timezone.ts` — calculate an IANA timezone's UTC offset at an exact instant without depending on the process timezone.
- `src/components/NextActionComposer.tsx` — natural-language input, preview, structured correction, keyboard handling, loading/error states, and save/cancel controls.
- `tests/next-action-parser.test.ts` — deterministic parser contract and timezone cases.
- `tests/next-action-composer.test.tsx` — real DOM interaction and accessibility tests.
- `tests/happydom.ts` — register browser globals for Bun tests.
- `tests/testing-library.ts` — clean React DOM state after each test.
- `bunfig.toml` — preload the two DOM test setup files in order.

### Modify

- `package.json` — add `chrono-node` and DOM test dependencies.
- `bun.lock` — lock the added packages.
- `src/lib/contact-time.ts` — deterministic deadline preview formatting at a fixed offset or IANA timezone.
- `tests/contact-time.test.ts` — preview formatting and timezone-offset assertions.
- `src/pages/ContactDetail.tsx:208-211,402-423,531-544,839-979` — delegate editor state and rendering to `NextActionComposer`.
- `tests/contact-detail-render.test.tsx` — preserve saved/empty card contracts.
- `tests/contact-detail-next-action.test.tsx` — prove the page opens the NLP composer.
- `vite.config.ts:17-24` — emit the lazy English Chrono code as a named `chrono` chunk for bundle verification.

---

### Task 1: Build the deterministic Next Action parser

**Files:**
- Create: `src/lib/next-action-parser.ts`
- Create: `src/lib/timezone.ts`
- Create: `tests/next-action-parser.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**
- Consumes: a sentence, fixed reference instant, and optional browser IANA timezone.
- Produces: `parseNextActionSentence(sentence, context): Promise<NextActionParseResult>` and the public parser types used by the composer.

- [ ] **Step 1: Write the first failing parser contract tests**

Create `tests/next-action-parser.test.ts` with a fixed Sunday reference so weekday behavior cannot depend on the test machine:

```ts
import { describe, expect, test } from "bun:test";

import { parseNextActionSentence } from "../src/lib/next-action-parser";

const SEOUL_CONTEXT = {
  now: new Date("2026-07-19T00:00:00.000Z"),
  timeZone: "Asia/Seoul",
};

describe("parseNextActionSentence", () => {
  test("extracts an action and explicit browser-local deadline", async () => {
    const result = await parseNextActionSentence(
      "Call Atul next Tuesday at 3pm",
      SEOUL_CONTEXT,
    );

    expect(result).toEqual({
      status: "valid",
      value: {
        actionText: "Call Atul",
        deadlineIso: "2026-07-21T06:00:00.000Z",
        matchedDateText: "next Tuesday at 3pm",
        timezoneLabel: "Asia/Seoul",
        timezoneOffsetMinutes: 540,
        assumedTime: false,
      },
    });
  });

  test("returns empty and missing-deadline states without guessing", async () => {
    expect(await parseNextActionSentence("   ", SEOUL_CONTEXT)).toEqual({
      status: "empty",
    });
    expect(
      await parseNextActionSentence("Call Atul", SEOUL_CONTEXT),
    ).toEqual({ status: "missing_deadline" });
  });
});
```

- [ ] **Step 2: Run the parser tests to verify RED**

Run:

```bash
bun test tests/next-action-parser.test.ts
```

Expected: FAIL because `src/lib/next-action-parser.ts` does not exist.

- [ ] **Step 3: Install the tested parser version**

Run:

```bash
bun add chrono-node@2.10.0
```

Expected: `package.json` contains `"chrono-node": "^2.10.0"` and `bun.lock` changes.

- [ ] **Step 4: Add the public parser contract and minimal implementation**

Create `src/lib/timezone.ts` first so parser output never depends on the machine timezone:

```ts
export function offsetMinutesForTimeZone(
  deadlineIso: string,
  timeZone: string,
): number | null {
  const deadline = new Date(deadlineIso);
  if (!Number.isFinite(deadline.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(deadline);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const year = values.year;
    const month = values.month;
    const day = values.day;
    const hour = values.hour;
    const minute = values.minute;
    const second = values.second;
    if (
      year === undefined ||
      month === undefined ||
      day === undefined ||
      hour === undefined ||
      minute === undefined ||
      second === undefined
    ) {
      return null;
    }
    const representedAsUtc = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
    );
    return Math.round((representedAsUtc - deadline.getTime()) / 60_000);
  } catch {
    return null;
  }
}
```

Then create `src/lib/next-action-parser.ts` with these public types and a minimal single-result parser. Import `offsetMinutesForTimeZone` from `@/lib/timezone`; keep the Chrono import dynamic and English-only:

```ts
import { offsetMinutesForTimeZone } from "@/lib/timezone";

export interface ParsedNextAction {
  actionText: string;
  deadlineIso: string;
  matchedDateText: string;
  timezoneLabel: string;
  timezoneOffsetMinutes: number;
  assumedTime: boolean;
}

export type NextActionParseResult =
  | { status: "valid"; value: ParsedNextAction }
  | { status: "empty" }
  | { status: "missing_action" }
  | { status: "missing_deadline" }
  | { status: "ambiguous"; matches: string[] }
  | { status: "past_deadline" };

export interface NextActionParserContext {
  now: Date;
  timeZone?: string;
}

function validTimeZone(value: string | undefined): string {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function cleanActionText(sentence: string, start: number, end: number): string {
  const before = sentence
    .slice(0, start)
    .replace(/(?:\s|[,;:–—-])*(?:by|on|at|before)\s*$/i, "");
  const after = sentence
    .slice(end)
    .replace(/^\s*[,;:–—-]?\s*/, "");
  return `${before} ${after}`
    .replace(/\s+/g, " ")
    .replace(/^[,;:–—-]+|[,;:–—-]+$/g, "")
    .trim();
}

export async function parseNextActionSentence(
  sentence: string,
  context: NextActionParserContext,
): Promise<NextActionParseResult> {
  if (!sentence.trim()) return { status: "empty" };

  const timeZone = validTimeZone(context.timeZone);
  const { casual } = await import("chrono-node/en");
  const results = casual.parse(
    sentence,
    { instant: context.now, timezone: timeZone },
    { forwardDate: true },
  );
  if (results.length === 0) return { status: "missing_deadline" };

  const result = results[0];
  const start = result.index;
  const end = result.index + result.text.length;
  const actionText = cleanActionText(sentence, start, end);
  if (!actionText) return { status: "missing_action" };

  const deadline = result.start.date();
  const timezoneOffsetMinutes =
    result.start.get("timezoneOffset") ??
    offsetMinutesForTimeZone(deadline.toISOString(), timeZone) ??
    0;

  return {
    status: "valid",
    value: {
      actionText,
      deadlineIso: deadline.toISOString(),
      matchedDateText: sentence.slice(start, end),
      timezoneLabel: timeZone,
      timezoneOffsetMinutes,
      assumedTime: false,
    },
  };
}
```

- [ ] **Step 5: Run the initial parser tests to verify GREEN**

Run:

```bash
bun test tests/next-action-parser.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Add failing phrase, timezone, assumption, and rejection tests**

Append focused tests with the following assertions:

```ts
test("normalizes next-week weekday ordering and fixed EST", async () => {
  const result = await parseNextActionSentence(
    "Follow up by next week Friday at 5pm EST",
    SEOUL_CONTEXT,
  );
  expect(result).toMatchObject({
    status: "valid",
    value: {
      actionText: "Follow up",
      deadlineIso: "2026-07-24T22:00:00.000Z",
      matchedDateText: "next week Friday at 5pm EST",
      timezoneLabel: "EST",
      timezoneOffsetMinutes: -300,
      assumedTime: false,
    },
  });
});

test("normalizes EOD and keeps ET daylight-aware", async () => {
  const result = await parseNextActionSentence(
    "Send proposal Friday EOD ET",
    SEOUL_CONTEXT,
  );
  expect(result).toMatchObject({
    status: "valid",
    value: {
      actionText: "Send proposal",
      deadlineIso: "2026-07-24T21:00:00.000Z",
      matchedDateText: "Friday EOD ET",
      timezoneLabel: "ET",
      timezoneOffsetMinutes: -240,
      assumedTime: false,
    },
  });
});

test("supports business aliases and fixed versus daylight-aware Pacific time", async () => {
  const cases = [
    {
      sentence: "Send proposal Friday COB PST",
      deadlineIso: "2026-07-25T01:00:00.000Z",
      label: "PST",
      offset: -480,
    },
    {
      sentence: "Send proposal Friday close of business PT",
      deadlineIso: "2026-07-25T00:00:00.000Z",
      label: "PT",
      offset: -420,
    },
  ];

  for (const item of cases) {
    const result = await parseNextActionSentence(item.sentence, SEOUL_CONTEXT);
    expect(result).toMatchObject({
      status: "valid",
      value: {
        actionText: "Send proposal",
        deadlineIso: item.deadlineIso,
        timezoneLabel: item.label,
        timezoneOffsetMinutes: item.offset,
      },
    });
  }
});

test("parses an absolute date with a named time", async () => {
  const result = await parseNextActionSentence(
    "Review contract August 4 at noon",
    SEOUL_CONTEXT,
  );
  expect(result).toMatchObject({
    status: "valid",
    value: {
      actionText: "Review contract",
      deadlineIso: "2026-08-04T03:00:00.000Z",
      assumedTime: false,
    },
  });
});

test("preserves an explicit numeric UTC offset", async () => {
  const result = await parseNextActionSentence(
    "Call Atul Friday at 5pm UTC+05:30",
    SEOUL_CONTEXT,
  );
  expect(result).toMatchObject({
    status: "valid",
    value: {
      deadlineIso: "2026-07-24T11:30:00.000Z",
      timezoneLabel: "UTC+05:30",
      timezoneOffsetMinutes: 330,
    },
  });
});

test("defaults a date-only deadline to 5pm and exposes the assumption", async () => {
  const result = await parseNextActionSentence(
    "Email quote in 3 days",
    SEOUL_CONTEXT,
  );
  expect(result).toMatchObject({
    status: "valid",
    value: {
      actionText: "Email quote",
      deadlineIso: "2026-07-22T08:00:00.000Z",
      assumedTime: true,
    },
  });
});

test("cleans a deadline at the beginning of the sentence", async () => {
  const result = await parseNextActionSentence(
    "By Friday at 5pm, call Atul",
    SEOUL_CONTEXT,
  );
  expect(result).toMatchObject({
    status: "valid",
    value: { actionText: "call Atul" },
  });
});

test("rejects missing actions, past deadlines, and multiple dates", async () => {
  expect(
    await parseNextActionSentence("Tomorrow at 3pm", SEOUL_CONTEXT),
  ).toEqual({ status: "missing_action" });
  expect(
    await parseNextActionSentence(
      "Call Atul yesterday at 3pm",
      SEOUL_CONTEXT,
    ),
  ).toEqual({ status: "past_deadline" });
  expect(
    await parseNextActionSentence(
      "Call Atul Monday and email them Friday",
      SEOUL_CONTEXT,
    ),
  ).toEqual({
    status: "ambiguous",
    matches: ["Monday", "Friday"],
  });
});

test("falls back to UTC when the supplied browser timezone is invalid", async () => {
  const result = await parseNextActionSentence("Call Atul tomorrow at noon", {
    ...SEOUL_CONTEXT,
    timeZone: "Not/A_Timezone",
  });
  expect(result).toMatchObject({
    status: "valid",
    value: { timezoneLabel: "UTC", timezoneOffsetMinutes: 0 },
  });
});
```

Run the tests again. Expected: the raw `next week Friday` phrase, EOD rule, default time, ambiguity, and past-deadline assertions fail.

- [ ] **Step 7: Implement same-width normalization and source-range preservation**

Add these private helpers above `parseNextActionSentence`. Same-width replacements keep all unchanged indices stable; replacement ranges expand Chrono's short normalized match back to the full original alias:

```ts
interface ReplacementRange {
  start: number;
  end: number;
}

interface NormalizedSentence {
  text: string;
  replacements: ReplacementRange[];
}

function replaceSameWidth(
  input: string,
  pattern: RegExp,
  replacementFor: (match: RegExpMatchArray) => string,
  replacements: ReplacementRange[],
): string {
  let output = input;
  for (const match of input.matchAll(pattern)) {
    const start = match.index;
    const replacement = replacementFor(match);
    if (replacement.length > match[0].length) continue;
    output =
      output.slice(0, start) +
      replacement.padEnd(match[0].length, " ") +
      output.slice(start + match[0].length);
    replacements.push({ start, end: start + match[0].length });
  }
  return output;
}

function normalizeSentence(sentence: string): NormalizedSentence {
  const replacements: ReplacementRange[] = [];
  let text = replaceSameWidth(
    sentence,
    /\bnext\s+week\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    (match) => `${match[1]} next week`,
    replacements,
  );
  text = replaceSameWidth(
    text,
    /\b(?:EOD|end\s+of\s+day|COB|close\s+of\s+business)\b/gi,
    () => "5pm",
    replacements,
  );
  return { text, replacements };
}

function originalRange(
  start: number,
  end: number,
  replacements: ReplacementRange[],
): ReplacementRange {
  let originalStart = start;
  let originalEnd = end;
  for (const replacement of replacements) {
    if (originalStart < replacement.end && originalEnd > replacement.start) {
      originalStart = Math.min(originalStart, replacement.start);
      originalEnd = Math.max(originalEnd, replacement.end);
    }
  }
  return { start: originalStart, end: originalEnd };
}

function explicitTimezoneLabel(text: string): string | null {
  return (
    text.match(
      /\b(?:(?:UTC|GMT)[+-]\d{1,2}(?::\d{2})?|EST|EDT|ET|Eastern\s+time|PST|PDT|PT|Pacific\s+time|UTC|GMT)\b/i,
    )?.[0] ?? null
  );
}
```

Update `parseNextActionSentence` to parse `normalized.text`, map every result through `originalRange`, reject multiple results, assign 17:00 before calling `date()` when `hour` is not certain, preserve explicit timezone labels, and reject deadlines at or before `context.now`:

```ts
const normalized = normalizeSentence(sentence);
const results = casual.parse(
  normalized.text,
  { instant: context.now, timezone: timeZone },
  { forwardDate: true },
);
if (results.length === 0) return { status: "missing_deadline" };

const ranges = results.map((result) =>
  originalRange(
    result.index,
    result.index + result.text.length,
    normalized.replacements,
  ),
);
if (ranges.length > 1) {
  return {
    status: "ambiguous",
    matches: ranges.map((range) => sentence.slice(range.start, range.end).trim()),
  };
}

const result = results[0];
const range = ranges[0];
const assumedTime = !result.start.isCertain("hour");
if (assumedTime) {
  result.start.assign("hour", 17);
  result.start.assign("minute", 0);
  result.start.assign("second", 0);
  result.start.assign("millisecond", 0);
}

const deadline = result.start.date();
if (deadline.getTime() <= context.now.getTime()) {
  return { status: "past_deadline" };
}

const matchedDateText = sentence.slice(range.start, range.end).trim();
const actionText = cleanActionText(sentence, range.start, range.end);
if (!actionText) return { status: "missing_action" };

const timezoneOffsetMinutes =
  result.start.get("timezoneOffset") ??
  offsetMinutesForTimeZone(deadline.toISOString(), timeZone) ??
  0;
const timezoneLabel = explicitTimezoneLabel(matchedDateText) ?? timeZone;
```

Return the completed `ParsedNextAction` with these calculated values.

- [ ] **Step 8: Run parser tests and targeted lint**

Run:

```bash
bun test tests/next-action-parser.test.ts
bun x eslint src/lib/timezone.ts src/lib/next-action-parser.ts tests/next-action-parser.test.ts
```

Expected: all parser tests pass and ESLint prints no findings.

- [ ] **Step 9: Commit the parser slice**

```bash
git add package.json bun.lock src/lib/timezone.ts src/lib/next-action-parser.ts tests/next-action-parser.test.ts
git commit -m "feat: parse natural-language next actions"
```

---

### Task 2: Format explicit and viewer-local deadline previews

**Files:**
- Modify: `src/lib/contact-time.ts`
- Modify: `tests/contact-time.test.ts`

**Interfaces:**
- Consumes: `deadlineIso`, `timezoneOffsetMinutes`, `timezoneLabel`, browser IANA timezone, and `offsetMinutesForTimeZone` from `src/lib/timezone.ts`.
- Produces: `formatDeadlineAtOffset` and `formatDeadlineInTimeZone` for `NextActionComposer`.

- [ ] **Step 1: Write failing preview-format tests**

Append to `tests/contact-time.test.ts`:

```ts
describe("NLP deadline preview formatting", () => {
  test("formats the exact input-zone deadline from its resolved offset", () => {
    expect(
      formatDeadlineAtOffset(
        "2026-07-24T22:00:00.000Z",
        -300,
        "EST",
      ),
    ).toBe("Fri, Jul 24, 5:00 PM EST");
  });

  test("formats the same instant in the viewer timezone", () => {
    expect(
      formatDeadlineInTimeZone(
        "2026-07-24T22:00:00.000Z",
        "Asia/Seoul",
      ),
    ).toContain("Sat, Jul 25, 7:00 AM");
  });

  test("computes the viewer offset at the deadline instant", () => {
    expect(
      offsetMinutesForTimeZone(
        "2026-07-24T22:00:00.000Z",
        "America/New_York",
      ),
    ).toBe(-240);
  });
});
```

Import the two formatting helpers from `@/lib/contact-time` and `offsetMinutesForTimeZone` from `@/lib/timezone`, then run:

```bash
bun test tests/contact-time.test.ts
```

Expected: FAIL because the preview helpers are not exported.

- [ ] **Step 2: Implement deterministic preview formatting**

Append these functions to `src/lib/contact-time.ts`:

```ts
function previewFormatter(timeZone: string, includeZone: boolean) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
    ...(includeZone ? { timeZoneName: "short" as const } : {}),
  });
}

export function formatDeadlineAtOffset(
  deadlineIso: string,
  timezoneOffsetMinutes: number,
  timezoneLabel: string,
): string | null {
  const deadlineMs = parseTimestamp(deadlineIso);
  if (deadlineMs === null || !Number.isFinite(timezoneOffsetMinutes)) return null;
  const shifted = new Date(deadlineMs + timezoneOffsetMinutes * 60_000);
  return `${previewFormatter("UTC", false).format(shifted)} ${timezoneLabel}`;
}

export function formatDeadlineInTimeZone(
  deadlineIso: string,
  timeZone: string,
): string | null {
  const deadlineMs = parseTimestamp(deadlineIso);
  if (deadlineMs === null) return null;
  try {
    return previewFormatter(timeZone, true).format(new Date(deadlineMs));
  } catch {
    return null;
  }
}

```

- [ ] **Step 3: Verify preview helpers in multiple process timezones**

Run:

```bash
bun test tests/contact-time.test.ts
TZ=America/New_York bun test tests/contact-time.test.ts
```

Expected: all tests pass in both processes because every new assertion supplies an explicit timezone or offset.

- [ ] **Step 4: Commit preview formatting**

```bash
git add src/lib/contact-time.ts tests/contact-time.test.ts
git commit -m "feat: format next action deadline previews"
```

---

### Task 3: Build and interaction-test the NLP composer

**Files:**
- Create: `src/components/NextActionComposer.tsx`
- Create: `tests/next-action-composer.test.tsx`
- Create: `tests/happydom.ts`
- Create: `tests/testing-library.ts`
- Create: `bunfig.toml`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**
- Consumes: `parseNextActionSentence`, the Task 2 preview helpers, optional existing action data, API pending/error state, and save/cancel callbacks.
- Produces: `NextActionComposer` with `onSave({ text, deadline })` using the unchanged REST mutation shape.

- [ ] **Step 1: Add the official Bun DOM test harness**

Install the test-only packages:

```bash
bun add --dev @happy-dom/global-registrator @testing-library/dom @testing-library/react
```

Create `tests/happydom.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
```

Create `tests/testing-library.ts`:

```ts
import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

function cleanupTestingDom() {
  cleanup();
  document.body.innerHTML = "";
}

afterEach(cleanupTestingDom);
```

Create `bunfig.toml`:

```toml
[test]
preload = ["./tests/happydom.ts", "./tests/testing-library.ts"]
```

Run the existing suite once:

```bash
bun test
```

Expected: the existing suite remains green with DOM globals preloaded.

- [ ] **Step 2: Write failing composer interaction tests**

Create `tests/next-action-composer.test.tsx`. Inject a parser stub so UI behavior is independent of Chrono internals:

```tsx
/// <reference lib="dom" />

import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NextActionComposer } from "../src/components/NextActionComposer";
import type { NextActionParseResult } from "../src/lib/next-action-parser";

const VALID_RESULT: NextActionParseResult = {
  status: "valid",
  value: {
    actionText: "Call Atul",
    deadlineIso: "2026-07-24T22:00:00.000Z",
    matchedDateText: "next week Friday at 5pm EST",
    timezoneLabel: "EST",
    timezoneOffsetMinutes: -300,
    assumedTime: false,
  },
};

function validParser(): Promise<NextActionParseResult> {
  return Promise.resolve(VALID_RESULT);
}

describe("NextActionComposer", () => {
  test("previews and saves one natural-language sentence", async () => {
    const onSave = mock(() => undefined);
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        referenceNow={() => new Date("2026-07-19T00:00:00.000Z")}
        parseDelayMs={0}
        parseSentence={validParser}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    const sentence = screen.getByLabelText("What should happen, and when?");
    fireEvent.change(sentence, {
      target: { value: "Call Atul by next week Friday at 5pm EST" },
    });
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    expect(await screen.findByText("Call Atul")).not.toBeNull();
    expect(screen.getByText("Fri, Jul 24, 5:00 PM EST")).not.toBeNull();
    expect(screen.getByText(/Sat, Jul 25, 7:00 AM/)).not.toBeNull();

    fireEvent.keyDown(sentence, { key: "Enter" });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        text: "Call Atul",
        deadline: "2026-07-24T22:00:00.000Z",
      });
    });
  });

  test("shows assumptions and allows structured correction", async () => {
    const assumedParser = mock(() =>
      Promise.resolve({
        status: "valid",
        value: {
          ...VALID_RESULT.value,
          assumedTime: true,
        },
      } satisfies NextActionParseResult),
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={assumedParser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("What should happen, and when?"), {
      target: { value: "Call Atul next Friday" },
    });
    expect(await screen.findByText("time assumed")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Edit action/i }));
    expect(screen.getByLabelText("Action")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Edit deadline/i }));
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("blocks ambiguous input and keeps mutation errors visible", async () => {
    const ambiguousParser = mock(() =>
      Promise.resolve({
        status: "ambiguous",
        matches: ["Monday", "Friday"],
      } satisfies NextActionParseResult),
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error="Failed to update next action."
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={ambiguousParser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("What should happen, and when?"), {
      target: { value: "Call Monday and email Friday" },
    });
    expect(await screen.findByText("Choose one deadline.")).not.toBeNull();
    expect(screen.getByText("Failed to update next action.")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Choose one deadline.",
    );
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    expect(screen.getByLabelText("Action")).not.toBeNull();
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("does not retain a stale valid deadline after the sentence becomes invalid", async () => {
    const parser = mock((sentence: string) =>
      Promise.resolve(
        sentence.includes("Friday")
          ? VALID_RESULT
          : ({ status: "missing_deadline" } satisfies NextActionParseResult),
      ),
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={parser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const sentence = screen.getByLabelText("What should happen, and when?");
    fireEvent.change(sentence, { target: { value: "Call Atul Friday" } });
    expect(await screen.findByText("Call Atul")).not.toBeNull();

    fireEvent.change(sentence, { target: { value: "Call Atul" } });
    expect(
      await screen.findByText("Add a deadline or choose it manually."),
    ).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(sentence, { target: { value: "Call Atul Friday" } });
    expect(await screen.findByText("Call Atul")).not.toBeNull();
    fireEvent.change(sentence, { target: { value: "" } });
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
  });

  test("opens an existing action in structured mode", () => {
    render(
      <NextActionComposer
        initialAction={{
          text: "Send proposal",
          deadline: "2026-07-24T22:00:00.000Z",
        }}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("What should happen, and when?")).toBeNull();
    expect(
      (screen.getByLabelText("Action") as HTMLInputElement).value,
    ).toBe("Send proposal");
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("cancels on Escape and falls back when parsing cannot load", async () => {
    const onCancel = mock(() => undefined);
    const failedParser = mock(() => Promise.reject(new Error("load failed")));
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={failedParser}
        onSave={() => undefined}
        onCancel={onCancel}
      />,
    );

    const sentence = screen.getByLabelText("What should happen, and when?");
    fireEvent.keyDown(sentence, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.change(sentence, { target: { value: "Call Atul tomorrow" } });
    expect(await screen.findByLabelText("Action")).not.toBeNull();
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });
});
```

Run:

```bash
bun test tests/next-action-composer.test.tsx
```

Expected: FAIL because `NextActionComposer` does not exist.

- [ ] **Step 3: Implement the composer state and parsing lifecycle**

Create `src/components/NextActionComposer.tsx` with this public contract:

```ts
export interface NextActionValue {
  text: string;
  deadline: string;
}

interface NextActionComposerProps {
  initialAction: NextActionValue | null;
  pending: boolean;
  error: string | null;
  browserTimeZone?: string;
  referenceNow?: () => Date;
  parseDelayMs?: number;
  parseSentence?: typeof parseNextActionSentence;
  onSave: (value: NextActionValue) => void;
  onCancel: () => void;
}
```

Use `useState` for `sentence`, `parseResult`, `draftAction`, `draftDeadline`, `editingAction`, `editingDeadline`, and `parserUnavailable`. Existing actions start in structured mode because the original sentence is not persisted. New actions start in sentence mode.

Initialize every editor state explicitly after destructuring the props:

```ts
const [sentence, setSentence] = useState("");
const [parseResult, setParseResult] = useState<NextActionParseResult>({
  status: "empty",
});
const [draftAction, setDraftAction] = useState(initialAction?.text ?? "");
const [draftDeadline, setDraftDeadline] = useState(
  initialAction ? toDatetimeLocalValue(initialAction.deadline) : "",
);
const [editingAction, setEditingAction] = useState(false);
const [editingDeadline, setEditingDeadline] = useState(false);
const [parserUnavailable, setParserUnavailable] = useState(false);
const [parsing, setParsing] = useState(false);
```

The parsing effect must cancel stale promises and debounce only non-empty new-action sentences:

```ts
useEffect(() => {
  if (initialAction || parserUnavailable) return;
  if (!sentence.trim()) {
    setParseResult({ status: "empty" });
    setDraftAction("");
    setDraftDeadline("");
    setParsing(false);
    return;
  }

  let cancelled = false;
  setParsing(true);
  const timeout = setTimeout(() => {
    parseSentence(sentence, {
      now: referenceNow(),
      timeZone: resolvedBrowserTimeZone,
    })
      .then((result) => {
        if (cancelled) return;
        setParseResult(result);
        if (result.status === "valid") {
          setDraftAction(result.value.actionText);
          setDraftDeadline(toDatetimeLocalValue(result.value.deadlineIso));
        } else if (result.status === "ambiguous") {
          setParserUnavailable(true);
          setDraftAction(sentence);
          setDraftDeadline("");
        } else {
          setDraftAction("");
          setDraftDeadline("");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setParserUnavailable(true);
        setDraftAction(sentence);
        setDraftDeadline("");
      })
      .finally(() => {
        if (!cancelled) setParsing(false);
      });
  }, parseDelayMs);

  return () => {
    cancelled = true;
    clearTimeout(timeout);
  };
}, [
  initialAction,
  parseDelayMs,
  parseSentence,
  parserUnavailable,
  referenceNow,
  resolvedBrowserTimeZone,
  sentence,
]);
```

Use stable module-level defaults so the dependency list does not restart parsing on every render:

```ts
function currentDate() {
  return new Date();
}

const DEFAULT_PARSE_DELAY_MS = 150;
```

Default `referenceNow`, `parseDelayMs`, and `parseSentence` to those stable
module-level values in the component parameter list. Resolve the browser zone
with this helper so an unavailable browser zone has the same UTC fallback as
the parser:

```ts
function browserTimeZoneOrUtc(browserTimeZone: string | undefined): string {
  const candidate =
    browserTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(
      new Date(),
    );
    return candidate;
  } catch {
    return "UTC";
  }
}
```

Compute the submit value from the draft fields and reject blank, over-500-character, invalid, parsing, or pending states:

```ts
const draftDeadlineIso = datetimeLocalToIso(draftDeadline);
const canSave = Boolean(
  draftAction.trim() &&
    draftAction.trim().length <= 500 &&
    draftDeadlineIso &&
    !parsing &&
    !pending,
);

function save() {
  if (!canSave || !draftDeadlineIso) return;
  onSave({ text: draftAction.trim(), deadline: draftDeadlineIso });
}

function handleSentenceKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Escape") {
    event.preventDefault();
    onCancel();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && canSave) {
    event.preventDefault();
    save();
  }
}
```

- [ ] **Step 4: Implement the accessible composer rendering**

Render these exact UI states in the same component:

1. New action: persistent label **What should happen, and when?**, a text input with the hint `Call Atul by next Friday at 5pm ET`, and an `aria-live="polite"` status region.
2. Parsing: helper copy **Understanding deadline…**; Save disabled.
3. Valid parse: full-width action and deadline preview buttons with Pencil and CalendarClock icons, `min-h-10`, muted surfaces, no divider borders, and pretty-wrapped text.
4. Assumed time: visible `text-xs` copy **time assumed** beside the deadline preview.
5. Explicit timezone with a different viewer offset: a tabular **Your time:** line using `formatDeadlineInTimeZone`.
6. Missing or past deadline: the exact design-spec message and a CalendarClock + **Choose date manually** button. Ambiguous input immediately opens the structured fields while retaining **Choose one deadline.** in the live status.
7. Parser failure, ambiguous input, or existing action: visible **Action** and **Deadline (your time)** structured fields.
8. Footer: Save button with Save/Loader icon swapping and Cancel button with X icon.

Use the preview helpers exactly as follows:

```ts
const parsed = parseResult.status === "valid" ? parseResult.value : null;
const deadlinePreview = parsed
  ? formatDeadlineAtOffset(
      parsed.deadlineIso,
      parsed.timezoneOffsetMinutes,
      parsed.timezoneLabel,
    )
  : null;
const viewerOffset = parsed
  ? offsetMinutesForTimeZone(parsed.deadlineIso, resolvedBrowserTimeZone)
  : null;
const viewerPreview =
  parsed && viewerOffset !== parsed.timezoneOffsetMinutes
    ? formatDeadlineInTimeZone(parsed.deadlineIso, resolvedBrowserTimeZone)
    : null;
const showManualDeadlineChoice =
  parseResult.status === "missing_deadline" ||
  parseResult.status === "past_deadline";
const statusMessage = parseStatusMessage(parseResult);
```

Map invalid statuses to fixed copy with a function declaration:

```ts
function parseStatusMessage(result: NextActionParseResult): string | null {
  switch (result.status) {
    case "missing_deadline":
      return "Add a deadline or choose it manually.";
    case "missing_action":
      return "Add what needs to be done.";
    case "ambiguous":
      return "Choose one deadline.";
    case "past_deadline":
      return "Choose a future deadline.";
    default:
      return null;
  }
}
```

Use this rendering structure so the tested labels, roles, icons, and hit areas
remain stable:

```tsx
return (
  <div className="space-y-4">
    {!initialAction && !parserUnavailable && (
      <div className="space-y-2">
        <Label htmlFor="next-action-sentence">
          What should happen, and when?
        </Label>
        <Input
          id="next-action-sentence"
          value={sentence}
          maxLength={600}
          placeholder="Call Atul by next Friday at 5pm ET"
          onChange={(event) => setSentence(event.target.value)}
          onKeyDown={handleSentenceKeyDown}
        />
      </div>
    )}

    {parsed && !parserUnavailable && (
      <div className="space-y-2">
        {editingAction ? (
          <div className="space-y-2">
            <Label htmlFor="next-action-draft-action">Action</Label>
            <Input
              id="next-action-draft-action"
              value={draftAction}
              maxLength={500}
              onChange={(event) => setDraftAction(event.target.value)}
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-10 w-full justify-start whitespace-normal bg-muted/50 px-3 py-2 text-left"
            aria-label={`Edit action: ${draftAction}`}
            onClick={() => setEditingAction(true)}
          >
            <Pencil className="h-4 w-4" />
            <span className="break-words text-pretty">{draftAction}</span>
          </Button>
        )}

        {editingDeadline ? (
          <div className="space-y-2">
            <Label htmlFor="next-action-draft-deadline">
              Deadline (your time)
            </Label>
            <Input
              id="next-action-draft-deadline"
              type="datetime-local"
              value={draftDeadline}
              onChange={(event) => setDraftDeadline(event.target.value)}
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-10 w-full justify-start whitespace-normal bg-muted/50 px-3 py-2 text-left tabular-nums"
            aria-label={`Edit deadline: ${deadlinePreview ?? "unknown"}`}
            onClick={() => setEditingDeadline(true)}
          >
            <CalendarClock className="h-4 w-4" />
            <span>{deadlinePreview}</span>
          </Button>
        )}

        {parsed.assumedTime && (
          <p className="text-xs font-medium text-muted-foreground">
            time assumed
          </p>
        )}
        {viewerPreview && (
          <p className="text-pretty text-xs tabular-nums text-muted-foreground">
            Your time: {viewerPreview}
          </p>
        )}
      </div>
    )}

    {(initialAction || parserUnavailable) && (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="next-action-manual-action">Action</Label>
          <Input
            id="next-action-manual-action"
            value={draftAction}
            maxLength={500}
            onChange={(event) => setDraftAction(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="next-action-manual-deadline">
            Deadline (your time)
          </Label>
          <Input
            id="next-action-manual-deadline"
            type="datetime-local"
            value={draftDeadline}
            onChange={(event) => setDraftDeadline(event.target.value)}
          />
        </div>
      </div>
    )}

    <div role="status" aria-live="polite" className="space-y-1">
      {parsing && (
        <p className="text-xs text-muted-foreground">
          Understanding deadline…
        </p>
      )}
      {statusMessage && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {statusMessage}
        </p>
      )}
      {draftAction.trim().length > 500 && (
        <p className="text-xs text-destructive">
          Keep the action under 500 characters.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>

    {showManualDeadlineChoice && !parserUnavailable && (
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setParserUnavailable(true);
          setDraftAction(sentence);
        }}
      >
        <CalendarClock className="h-4 w-4" />
        Choose date manually
      </Button>
    )}

    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={!canSave} onClick={save}>
        {pending ? (
          <Loader className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save
      </Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
        <X className="h-4 w-4" />
        Cancel
      </Button>
    </div>
  </div>
);
```

- [ ] **Step 5: Run interaction, parser, and formatting tests**

Run:

```bash
bun test tests/next-action-composer.test.tsx tests/next-action-parser.test.ts tests/contact-time.test.ts
```

Expected: all focused tests pass with no React `act` warnings.

- [ ] **Step 6: Run targeted lint and commit the composer**

```bash
bun x eslint src/components/NextActionComposer.tsx tests/next-action-composer.test.tsx tests/happydom.ts tests/testing-library.ts
git add package.json bun.lock bunfig.toml tests/happydom.ts tests/testing-library.ts tests/next-action-composer.test.tsx src/components/NextActionComposer.tsx
git commit -m "feat: add natural-language next action composer"
```

Expected: ESLint prints no findings and the commit contains only composer/test-harness files.

---

### Task 4: Integrate the composer and verify lazy loading

**Files:**
- Modify: `src/pages/ContactDetail.tsx`
- Modify: `tests/contact-detail-render.test.tsx`
- Create: `tests/contact-detail-next-action.test.tsx`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `NextActionComposer` and `NextActionValue` from Task 3.
- Produces: the contact page opens the NLP composer for new actions, structured mode for existing actions, and submits through the existing mutation.

- [ ] **Step 1: Write the failing page-level interaction test**

Create `tests/contact-detail-next-action.test.tsx` using the same cached contact fixture and router structure as `tests/contact-detail-render.test.tsx`, then assert that Add Next Action opens the new composer:

```tsx
/// <reference lib="dom" />

import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ContactDetailPage from "../src/pages/ContactDetail";

test("opens the natural-language Next Action composer", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["projects", "p1", "contacts", "c1"], {
    id: "c1",
    projectId: "p1",
    name: "Atul Shah",
    email: "atul@example.com",
    phone: null,
    notes: null,
    metadata: null,
    company: null,
    companyWebsite: null,
    position: null,
    companySize: null,
    estimatedRevenue: null,
    linkedinUrl: null,
    nextActionText: null,
    nextActionDeadline: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    tags: [],
    activity: [],
  });
  queryClient.setQueryData(["projects", "p1", "enrichment-usage"], {
    used: 0,
    limit: 10,
    remaining: 10,
    unlimited: false,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/projects/p1/contacts/c1"]}>
        <Routes>
          <Route
            path="/app/projects/:projectId/contacts/:contactId"
            element={<ContactDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Add Next Action" }));
  expect(
    screen.getByLabelText("What should happen, and when?"),
  ).not.toBeNull();
});
```

Run:

```bash
bun test tests/contact-detail-next-action.test.tsx
```

Expected: FAIL because the existing editor renders separate Action and Deadline fields.

- [ ] **Step 2: Replace page-owned editor state with the composer**

In `src/pages/ContactDetail.tsx`:

- Import `NextActionComposer` and `type NextActionValue`.
- Remove the page's `nextActionText` and `nextActionDeadline` state.
- Remove `datetimeLocalToIso`, `toDatetimeLocalValue`, and the Save icon imports when they become unused.
- Keep `editingNextAction` and `nextActionError` because the page owns card visibility and mutation errors.
- Simplify `startNextActionEditor` to clear the mutation error and set editing true.
- Replace `saveNextAction()` with the exact mutation bridge:

```ts
function saveNextAction(value: NextActionValue) {
  setNextActionError(null);
  nextActionMutation.mutate(value);
}
```

- Remove `nextActionDeadlineIso` and `canSaveNextAction` derived values.
- Replace the entire existing editor branch with:

```tsx
<NextActionComposer
  initialAction={
    contact.nextActionText && contact.nextActionDeadline
      ? {
          text: contact.nextActionText,
          deadline: contact.nextActionDeadline,
        }
      : null
  }
  pending={nextActionMutation.isPending}
  error={nextActionError}
  onSave={saveNextAction}
  onCancel={cancelNextActionEditor}
/>
```

Do not change the saved, empty, Edit, Mark Done, mutation, or cache-invalidation branches.

- [ ] **Step 3: Preserve existing SSR render contracts**

Update `tests/contact-detail-render.test.tsx` only if class or text placement changed around the editor boundary. The existing assertions must continue to prove:

```ts
expect(html).toMatch(
  /data-next-action-card="true"[\s\S]*?Next Action[\s\S]*?No next action[\s\S]*?Add Next Action[\s\S]*?Quick Stats/,
);
expect(html).toContain("Edit");
expect(html).toContain("Mark Done");
```

Run:

```bash
bun test tests/contact-detail-next-action.test.tsx tests/contact-detail-render.test.tsx tests/next-action-composer.test.tsx
```

Expected: all page and composer tests pass.

- [ ] **Step 4: Name and verify the lazy Chrono chunk**

Add the English entry to the existing `manualChunks` object in `vite.config.ts`:

```ts
manualChunks: {
  "react-vendor": ["react", "react-dom", "react-router-dom"],
  "query-vendor": ["@tanstack/react-query"],
  chrono: ["chrono-node/en"],
},
```

Run the production build with a writable Wrangler log:

```bash
WRANGLER_LOG_PATH=/tmp/linkycal-wrangler-next-action-nlp.log bun run build
```

Expected: build succeeds and emits an asset named `chrono-<hash>.js`.

Verify the initial HTML does not eagerly reference it:

```bash
find dist/client/assets -maxdepth 1 -name 'chrono-*.js' -print
rg -n 'chrono-' dist/client/index.html
```

Expected: `find` prints exactly one Chrono chunk; `rg` prints no match and exits 1 because the dynamic chunk is absent from initial HTML.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
git diff --check
bun test
bun x eslint src/lib/timezone.ts src/lib/next-action-parser.ts src/lib/contact-time.ts src/components/NextActionComposer.tsx src/pages/ContactDetail.tsx tests/happydom.ts tests/testing-library.ts tests/next-action-parser.test.ts tests/contact-time.test.ts tests/next-action-composer.test.tsx tests/contact-detail-next-action.test.tsx tests/contact-detail-render.test.tsx vite.config.ts
WRANGLER_LOG_PATH=/tmp/linkycal-wrangler-next-action-nlp-final.log bun run build
bun run lint
```

Expected:

- `git diff --check`: no output.
- `bun test`: all tests pass.
- Targeted ESLint: no findings.
- Build: succeeds; the existing large-client-chunk warning may remain.
- Full lint: compare against the known baseline. At plan-writing time it exits 1 with 23 errors and 23 warnings outside this feature, including two pre-existing findings in `worker/services/workflow-execution-service.ts`; this task must introduce no additional findings.

- [ ] **Step 6: Perform the manual acceptance pass**

Start or restart the dev server on its configured port:

```bash
WRANGLER_LOG_PATH=/tmp/linkycal-wrangler-next-action-nlp-dev.log bun run dev
```

On a contact without a Next Action, verify:

1. `Call Atul tomorrow at 3pm` shows action and exact deadline preview.
2. `Follow up by next week Friday at 5pm EST` shows 5:00 PM EST and the correct browser-local conversion.
3. `Send proposal Friday EOD ET` resolves 5:00 PM using daylight-aware Eastern time.
4. `Email quote in 3 days` visibly shows **time assumed**.
5. A sentence with two dates does not save and offers manual deadline entry.
6. Clicking action or deadline preview permits structured correction.
7. Enter saves, Escape cancels, Edit reopens structured mode, and Mark Done still clears the action.

- [ ] **Step 7: Commit the integration slice**

```bash
git add src/pages/ContactDetail.tsx tests/contact-detail-render.test.tsx tests/contact-detail-next-action.test.tsx vite.config.ts
git commit -m "feat: integrate natural-language next actions"
```

The branch is ready for code review after this commit. No migration or remote database command is required.
