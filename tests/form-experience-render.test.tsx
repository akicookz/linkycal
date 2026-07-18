import { describe, expect, test } from "bun:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { FormExperience } from "../src/components/FormExperience";
import type {
  FormExperienceField,
  FormExperienceForm,
} from "../src/lib/form-experience";

function field(id: string, label: string): FormExperienceField {
  return {
    id,
    stepId: "s1",
    sortOrder: id === "first" ? 0 : 1,
    type: "text",
    label,
    description: null,
    placeholder: null,
    required: false,
    validation: null,
    options: null,
    visibility: null,
    contactMapping: null,
  };
}

function form(type: "multi_step" | "single"): FormExperienceForm {
  return {
    id: "f1",
    name: "Lead form",
    type,
    status: "active",
    steps: [
      {
        id: "s1",
        sortOrder: 0,
        title: null,
        description: null,
        richDescription: null,
        settings: null,
        visibility: null,
        fields: [field("first", "First question"), field("second", "Second question")],
      },
    ],
  };
}

const TEXTUAL_FOCUSED_FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "url",
  "number",
  "date",
  "time",
  "textarea",
  "select",
  "multi_select",
  "radio",
  "checkbox",
  "file",
] as const;

function answerForm(fieldType: string): FormExperienceForm {
  const current = form("multi_step");
  const hasOptions = ["select", "multi_select", "radio"].includes(fieldType);
  current.steps[0].fields = [
    {
      ...current.steps[0].fields[0],
      type: fieldType,
      options: hasOptions
        ? [
            { label: "My company", value: "company" },
            { label: "Client sites", value: "clients" },
          ]
        : null,
    },
  ];
  return current;
}

function focusedChoiceLabelClasses(html: string): string {
  const match = html.match(
    /data-focused-choice="true"[\s\S]*?<span class="([^"]*min-w-0[^"]*)"/,
  );
  if (!match) throw new Error("Focused choice label was not rendered");
  return match[1];
}

function focusedAnswerClasses(html: string, fieldType: string): string {
  if (["select", "multi_select", "radio", "checkbox"].includes(fieldType)) {
    return focusedChoiceLabelClasses(html);
  }

  const pattern =
    fieldType === "textarea"
      ? /<textarea[^>]*id="first"[^>]*class="([^"]+)"/
      : fieldType === "file"
        ? /<span class="([^"]*block truncate[^"]*)"/
        : /<input[^>]*id="first"[^>]*class="([^"]+)"/;
  const match = html.match(pattern);
  if (!match) throw new Error(`Focused ${fieldType} answer was not rendered`);
  return match[1];
}

function focusedControlClasses(html: string, fieldType: string): string {
  const pattern = ["select", "multi_select", "radio", "checkbox"].includes(
    fieldType,
  )
    ? /<button[^>]*data-focused-choice="true"[^>]*class="([^"]+)"/
    : fieldType === "textarea"
      ? /<textarea[^>]*id="first"[^>]*class="([^"]+)"/
      : fieldType === "file"
        ? /<label class="([^"]*ring-shadow flex w-full[^"]*)"/
        : /<input[^>]*id="first"[^>]*class="([^"]+)"/;
  const match = html.match(pattern);
  if (!match) throw new Error(`Focused ${fieldType} control was not rendered`);
  return match[1];
}

function renderExperience(
  currentForm: FormExperienceForm,
  overrides: Partial<ComponentProps<typeof FormExperience>> = {},
): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <FormExperience
        form={currentForm}
        surface="booking"
        values={{}}
        submitting={false}
        error={null}
        onValueChange={() => {}}
        onClearFields={() => {}}
        onCheckpoint={async () => true}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("FormExperience render contract", () => {
  test("focused mode renders only the current question", () => {
    const html = renderExperience(form("multi_step"));
    expect(html).toContain("First question");
    expect(html).not.toContain("Second question");
  });

  test("classic mode renders every field in the current section", () => {
    const html = renderExperience(form("single"));
    expect(html).toContain("First question");
    expect(html).toContain("Second question");
  });

  test("focused booking uses booking completion copy", () => {
    const current = form("multi_step");
    current.steps[0].fields = [current.steps[0].fields[0]];
    const html = renderExperience(current);
    expect(html).toContain("Confirm Booking");
    expect(html).not.toContain(">Submit<");
  });

  test("focused booking uses compact typography and screen spacing", () => {
    const html = renderExperience(form("multi_step"));
    expect(html).toContain('data-density="compact"');
    expect(html).toContain("py-4 sm:py-6");
    expect(html).toContain("text-lg sm:text-xl");
    expect(html).toContain('data-focused-question-number="1"');
    expect(html).toContain('data-control-density="compact"');
    expect(html).toContain('id="first"');
  });

  test("focused text controls use muted primary surfaces", () => {
    const textHtml = renderExperience(form("multi_step"));
    const textareaForm = form("multi_step");
    textareaForm.steps[0].fields = [
      { ...textareaForm.steps[0].fields[0], type: "textarea" },
    ];
    const textareaHtml = renderExperience(textareaForm);

    for (const html of [textHtml, textareaHtml]) {
      expect(html).toContain("bg-primary/[0.03]");
      expect(html).toContain("focus:bg-primary/[0.045]");
    }
  });

  test("standalone focused form keeps comfortable density", () => {
    const html = renderExperience(form("multi_step"), {
      surface: "standalone",
    });
    expect(html).toContain('data-density="comfortable"');
    expect(html).toContain("text-xl sm:text-2xl");
    expect(html).toContain('data-focused-question-number="1"');
    expect(html).toContain('data-control-density="comfortable"');
    expect(html).not.toContain("py-4 sm:py-6");
  });

  test("focused progress stays hidden before the first question", () => {
    const current = form("multi_step");
    current.steps[0].title = "A short introduction";

    const bookingHtml = renderExperience(current);
    const standaloneHtml = renderExperience(current, { surface: "standalone" });

    expect(bookingHtml).not.toContain(
      "h-1 w-full overflow-hidden rounded-full bg-primary/10 mb-6",
    );
    expect(standaloneHtml).not.toContain(
      "absolute top-0 left-0 right-0 h-1 bg-primary/10 z-10",
    );
  });

  test("focused progress starts at the first question and anchors to the booking card top", () => {
    const bookingHtml = renderExperience(form("multi_step"));
    const standaloneHtml = renderExperience(form("multi_step"), {
      surface: "standalone",
    });

    expect(bookingHtml).toContain('data-focused-progress="booking"');
    expect(bookingHtml).toContain(
      "absolute top-2 right-0 left-14 sm:left-16",
    );
    expect(bookingHtml).toContain('style="width:50%"');
    expect(standaloneHtml).toContain('data-focused-progress="standalone"');
    expect(standaloneHtml).toContain('style="width:50%"');
  });

  test("focused choice controls use customizable shadow rings", () => {
    const html = renderExperience(answerForm("select"));
    expect(html).toContain('data-focused-choice="true"');
    expect(html).toContain("ring-shadow");
    expect(html).not.toContain("border-primary/30");
  });

  test("focused booking keeps every textual answer at text-base", () => {
    for (const fieldType of TEXTUAL_FOCUSED_FIELD_TYPES) {
      const html = renderExperience(answerForm(fieldType));
      const classes = focusedAnswerClasses(html, fieldType);

      expect(classes).toContain("text-base");
      expect(classes).not.toContain("sm:text-lg");
      expect(classes).not.toContain("sm:text-xl");
    }
  });

  test("focused standalone keeps every textual answer at text-lg", () => {
    for (const fieldType of TEXTUAL_FOCUSED_FIELD_TYPES) {
      const html = renderExperience(answerForm(fieldType), {
        surface: "standalone",
      });
      const classes = focusedAnswerClasses(html, fieldType);

      expect(classes).toContain("text-lg");
      expect(classes).not.toContain("sm:text-lg");
      expect(classes).not.toContain("sm:text-xl");
    }
  });

  test("focused standalone caps every textual control at the select width", () => {
    for (const fieldType of TEXTUAL_FOCUSED_FIELD_TYPES) {
      const html = renderExperience(answerForm(fieldType), {
        surface: "standalone",
      });

      expect(focusedControlClasses(html, fieldType)).toContain("max-w-xl");
    }
  });

  test("focused booking keeps textual controls uncapped", () => {
    for (const fieldType of TEXTUAL_FOCUSED_FIELD_TYPES) {
      const html = renderExperience(answerForm(fieldType));

      expect(focusedControlClasses(html, fieldType)).not.toContain("max-w-xl");
    }
  });

  test("classic booking keeps the existing section title and both fields", () => {
    const current = form("single");
    current.steps[0].title = "Qualification";
    const html = renderExperience(current);
    expect(html).toContain("Qualification");
    expect(html).toContain("First question");
    expect(html).toContain("Second question");
  });

  test("classic booking keeps the legacy submitting button contract", () => {
    const html = renderExperience(form("single"), { submitting: true });

    expect(html).toContain("lucide-loader ");
    expect(html).toContain("Booking...");
    expect(html).not.toContain("Confirm Booking");
  });

  test("booking exclusion removes the mapped field", () => {
    const html = renderExperience(form("multi_step"), {
      excludedFieldIds: new Set(["first"]),
      values: { first: "Ada" },
    });
    expect(html).not.toContain("First question");
    expect(html).toContain("Second question");
  });

  test("zero-content booking offers final confirmation", () => {
    const html = renderExperience(form("multi_step"), {
      excludedFieldIds: new Set(["first", "second"]),
    });
    expect(html).toContain("Confirm Booking");
    expect(html).not.toContain(">Next<");
  });

  test("standalone surface retains powered-by branding", () => {
    const html = renderExperience(form("multi_step"), {
      surface: "standalone",
    });
    expect(html).toContain("Powered by");
  });
});
