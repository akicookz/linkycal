// ─── Prompt Generation for Copy Prompt Feature ──────────────────────────────

import { richTextToPlainText } from "@/lib/rich-text";

interface EventTypeForPrompt {
  name: string;
  slug: string;
  duration: number;
  description: string | null;
  location: string | null;
  bufferBefore: number;
  bufferAfter: number;
  maxPerDay: number | null;
  requiresConfirmation?: boolean;
  bookingFormId?: string | null;
}

interface FormFieldForPrompt {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string | null;
  options: Array<{ label: string; value: string }> | null;
}

interface FormStepForPrompt {
  title: string | null;
  description: string | null;
  richDescription?: string | null;
  fields: FormFieldForPrompt[];
}

interface FormForPrompt {
  name: string;
  slug: string;
  type: string;
  steps?: FormStepForPrompt[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exampleValue(field: FormFieldForPrompt): string {
  switch (field.type) {
    case "email":
      return "jane@example.com";
    case "phone":
      return "+1 (555) 123-4567";
    case "number":
      return "42";
    case "date":
      return "2026-03-24";
    case "time":
      return "14:30";
    case "rating":
      return "5";
    case "checkbox":
      return "true";
    case "textarea":
      return "Need help with onboarding";
    case "select":
    case "radio":
      return field.options?.[0]?.value ?? "option_1";
    case "multi_select":
      return field.options?.slice(0, 2).map((option) => option.value).join(",") ?? "option_1,option_2";
    default:
      return "Jane Smith";
  }
}

function exampleApiField(field: FormFieldForPrompt): Record<string, string> {
  if (field.type === "file") {
    return {
      fieldId: field.id,
      fileUrl: "https://example.com/uploads/brief.pdf",
    };
  }

  return {
    fieldId: field.id,
    value: exampleValue(field),
  };
}

function renderFieldGuide(fields: FormFieldForPrompt[]): string {
  if (fields.length === 0) {
    return "- No fields.";
  }

  return fields
    .map((field) => {
      const parts = [field.type, field.required ? "required" : "optional"];
      if (field.options?.length) {
        parts.push(`values: ${field.options.map((option) => `\`${option.value}\``).join(", ")}`);
      }

      return `- \`${field.id}\` (${field.label}) — ${parts.join(", ")}`;
    })
    .join("\n");
}

function renderStepApiExample(
  origin: string,
  formSlug: string,
  stepIndex: number,
  fields: FormFieldForPrompt[],
): string {
  const requestBody = JSON.stringify(
    {
      fields: fields.map((field) => exampleApiField(field)),
    },
    null,
    2,
  );

  return `\`\`\`bash
curl -X PATCH "${origin}/api/v1/forms/${formSlug}/responses/RESPONSE_ID/steps/${stepIndex}" \\
  -H "Content-Type: application/json" \\
  -d '${requestBody}'
\`\`\``;
}

function renderHtmlField(field: FormFieldForPrompt): string {
  const id = escapeHtml(field.id);
  const label = escapeHtml(field.label);
  const placeholder = field.placeholder
    ? ` placeholder="${escapeHtml(field.placeholder)}"`
    : "";
  const required = field.required ? " required" : "";

  switch (field.type) {
    case "textarea":
      return [
        `<label for="${id}">${label}</label>`,
        `<textarea id="${id}" name="${id}"${placeholder}${required}></textarea>`,
      ].join("\n");

    case "select":
      return [
        `<label for="${id}">${label}</label>`,
        `<select id="${id}" name="${id}"${required}>`,
        `  <option value="">Select an option</option>`,
        ...(field.options ?? []).map(
          (option) =>
            `  <option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
        ),
        `</select>`,
      ].join("\n");

    case "multi_select":
      return [
        `<fieldset>`,
        `  <legend>${label}</legend>`,
        ...(field.options ?? []).map(
          (option) =>
            `  <label><input type="checkbox" name="${id}" value="${escapeHtml(option.value)}" /> ${escapeHtml(option.label)}</label>`,
        ),
        `</fieldset>`,
      ].join("\n");

    case "radio":
      return [
        `<fieldset>`,
        `  <legend>${label}</legend>`,
        ...(field.options ?? []).map(
          (option) =>
            `  <label><input type="radio" name="${id}" value="${escapeHtml(option.value)}"${required} /> ${escapeHtml(option.label)}</label>`,
        ),
        `</fieldset>`,
      ].join("\n");

    case "checkbox":
      return `<label><input type="checkbox" name="${id}" value="true"${required} /> ${label}</label>`;

    case "rating":
      return [
        `<label for="${id}">${label}</label>`,
        `<select id="${id}" name="${id}"${required}>`,
        `  <option value="">Select a rating</option>`,
        `  <option value="1">1</option>`,
        `  <option value="2">2</option>`,
        `  <option value="3">3</option>`,
        `  <option value="4">4</option>`,
        `  <option value="5">5</option>`,
        `</select>`,
      ].join("\n");

    case "file":
      return [
        `<!-- File upload fields are not supported on the native HTML action endpoint yet -->`,
        `<!-- <label for="${id}">${label}</label> -->`,
        `<!-- <input id="${id}" name="${id}" type="file"${required} /> -->`,
      ].join("\n");

    default: {
      const inputType =
        field.type === "email"
          ? "email"
          : field.type === "phone"
            ? "tel"
            : field.type === "number"
              ? "number"
              : field.type === "date"
                ? "date"
                : field.type === "time"
                  ? "time"
                  : "text";

      return [
        `<label for="${id}">${label}</label>`,
        `<input id="${id}" name="${id}" type="${inputType}"${placeholder}${required} />`,
      ].join("\n");
    }
  }
}

function renderHtmlFormExample(form: FormForPrompt, projectSlug: string, origin: string): string {
  const lines = [
    `<form action="${origin}/api/public/forms/${projectSlug}/${form.slug}/submit" method="post">`,
  ];

  for (let i = 0; i < (form.steps?.length ?? 0); i++) {
    const step = form.steps?.[i];
    if (!step) continue;
    const stepDescription =
      richTextToPlainText(step.richDescription) || step.description || "";

    lines.push(`  <!-- Step ${i + 1}${step.title ? `: ${escapeHtml(step.title)}` : ""} -->`);

    if (stepDescription) {
      lines.push(`  <!-- ${escapeHtml(stepDescription)} -->`);
    }

    for (const field of step.fields) {
      const rendered = renderHtmlField(field)
        .split("\n")
        .map((line) => `  ${line}`);
      lines.push(...rendered, "");
    }
  }

  lines.push(`  <button type="submit">Submit</button>`, `</form>`);
  return lines.join("\n").replace(/\n\n\n+/g, "\n\n");
}

// ─── Event Type Prompts ─────────────────────────────────────────────────────

export function generateEventTypeApiPrompt(
  et: EventTypeForPrompt,
  projectSlug: string,
  origin: string,
  bookingFormFields?: FormFieldForPrompt[],
): string {
  const bookingRequest = {
    projectSlug,
    eventTypeSlug: et.slug,
    name: "Jane Smith",
    email: "jane@example.com",
    startTime: "2026-03-24T09:00:00Z",
    timezone: "America/New_York",
    notes: "Looking forward to our meeting",
    ...(bookingFormFields?.length
      ? {
          formFields: Object.fromEntries(
            bookingFormFields.map((field) => [field.id, exampleValue(field)]),
          ),
        }
      : {}),
  };

  const bookingFieldsSection =
    bookingFormFields && bookingFormFields.length > 0
      ? `
## Booking Form Fields
Use these exact keys inside \`formFields\`:
${renderFieldGuide(bookingFormFields)}
`
      : "";

  return `# LinkyCal Booking API — "${et.name}"

## Event
- projectSlug: \`${projectSlug}\`
- eventTypeSlug: \`${et.slug}\`
- Duration: ${et.duration} minutes
- Location: ${et.location || "Not specified"}
- Requires confirmation: ${et.requiresConfirmation ? "Yes" : "No"}
${et.maxPerDay ? `- Max bookings per day: ${et.maxPerDay}` : ""}

## Check Availability
\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${origin}/api/v1/availability/${projectSlug}?date=2026-03-24&timezone=America/New_York&eventTypeSlug=${et.slug}"
\`\`\`

Use the returned slot \`start\` value when creating the booking.

## Create Booking
\`\`\`bash
curl -X POST "${origin}/api/v1/bookings" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(bookingRequest, null, 2)}'
\`\`\`
${bookingFieldsSection}
${et.requiresConfirmation
    ? 'Successful requests create a booking with status `"pending"` until the host approves it.'
    : 'Successful requests create a booking with status `"confirmed"`.'}

## Documentation
- General docs: ${origin}/docs
- Check availability: ${origin}/docs#check-availability
- Create booking: ${origin}/docs#create-booking
`.trim();
}

export function generateEventTypeEmbedPrompt(
  et: EventTypeForPrompt,
  projectSlug: string,
): string {
  return `# Embed LinkyCal Booking Widget — "${et.name}"

## Quick Start

Add a container element and the widget script to your HTML page:

\`\`\`html
<!-- Container where the booking widget will render -->
<div id="linkycal-booking"></div>

<!-- Load the widget -->
<script src="https://cdn.linkycal.com/widgets/booking.js"></script>
<script>
  LinkyCal.booking({
    projectSlug: "${projectSlug}",
    eventTypeSlug: "${et.slug}",
    container: "#linkycal-booking"
  });
</script>
\`\`\`

## Theme Customization

Match the widget to your brand:

\`\`\`javascript
LinkyCal.booking({
  projectSlug: "${projectSlug}",
  eventTypeSlug: "${et.slug}",
  container: "#linkycal-booking",
  theme: {
    primaryBg: "#1B4332",       // Primary button/accent background
    primaryText: "#ffffff",      // Text color on primary buttons
    backgroundColor: "#ffffff",  // Widget background color
    textColor: "#0f1a14",       // Main text color
    borderRadius: 16             // Corner roundness in pixels (0-32)
  }
});
\`\`\`

## Event Type Details
- **${et.name}** — ${et.duration} minute sessions
${et.location ? `- Location: ${et.location}` : ""}
${et.description ? `- ${et.description}` : ""}
${et.requiresConfirmation ? "- Bookings require host confirmation before being finalized" : "- Bookings are confirmed instantly with calendar invites"}

## Widget Features
- Fully responsive — works on mobile, tablet, and desktop
- Multi-step flow: date selection → time slot picker → guest details → confirmation
- Google Calendar invites sent automatically to both parties
- Google Meet links auto-generated for each booking
- Timezone auto-detected from the visitor's browser

## Integration Notes
- Place the \`<div>\` container wherever you want the widget to appear on your page
- The script loads asynchronously and won't block your page rendering
- The widget is self-contained — no additional CSS or dependencies needed
- Multiple widgets can coexist on the same page with different container IDs

**Where on your website would you like to embed this booking widget?** (e.g., contact page, homepage, dedicated booking page)
`.trim();
}

// ─── Form Prompts ───────────────────────────────────────────────────────────

export function generateFormApiPrompt(
  form: FormForPrompt,
  projectSlug: string,
  origin: string,
): string {
  const allFields = form.steps?.flatMap((step) => step.fields) ?? [];
  const hasFileFields = allFields.some((field) => field.type === "file");
  const stepsSection = (form.steps ?? [])
    .map((step, index) => {
      const stepDescription =
        richTextToPlainText(step.richDescription) || step.description || "";

      return `### Step ${index} ${step.title ? `— ${step.title}` : ""}
${stepDescription ? `${stepDescription}\n` : ""}Fields:
${renderFieldGuide(step.fields)}

Example:
${renderStepApiExample(origin, form.slug, index, step.fields)}`;
    })
    .join("\n\n");

  const nativeHtmlSection = hasFileFields
    ? `## Native HTML Form Action
POST ${origin}/api/public/forms/${projectSlug}/${form.slug}/submit

This form includes file fields, so native HTML form submission is not supported. Use the JSON API flow above or the widget instead.`
    : `## Native HTML Form Action
POST ${origin}/api/public/forms/${projectSlug}/${form.slug}/submit

Use the exact field IDs above as your HTML input \`name\` attributes.

\`\`\`html
${renderHtmlFormExample(form, projectSlug, origin)}
\`\`\``;

  return `# LinkyCal Form API / Form Action — "${form.name}"

## Form
- projectSlug: \`${projectSlug}\`
- formSlug: \`${form.slug}\`
- Type: ${form.type === "multi_step" ? "Multi-step" : "Single step"}
${form.steps ? `- Steps: ${form.steps.length}` : ""}
- Public endpoints; no auth required.

Use one flow at a time:
- JSON API for step-by-step submission or file uploads
- Native HTML form action for plain browser forms without JavaScript

## Start Response
\`\`\`bash
curl -X POST "${origin}/api/v1/forms/${form.slug}/responses?projectSlug=${projectSlug}" \\
  -H "Content-Type: application/json" \\
  -d '{}'
\`\`\`

Save \`response.id\` from the result and use it in the step submissions below.

## Submit Steps
${stepsSection || "No steps configured yet."}

After the final step, the response status becomes \`"completed"\`.

${nativeHtmlSection}

## Documentation
- General docs: ${origin}/docs
- Start response: ${origin}/docs#create-response
- Submit step: ${origin}/docs#submit-step
- Native HTML form action: ${origin}/docs#native-html-form
- Form widget: ${origin}/docs#form-widget
`.trim();
}

export function generateFormEmbedPrompt(
  form: FormForPrompt,
  projectSlug: string,
  origin = "https://linkycal.com",
): string {
  return `# Embed LinkyCal Form Widget — "${form.name}"

## Quick Start

Add a container element and the widget script to your HTML page:

\`\`\`html
<!-- Container where the form widget will render -->
<div id="linkycal-form"></div>

<!-- Load the widget -->
<script src="https://cdn.linkycal.com/widgets/form.js"></script>
<script>
  LinkyCal.form({
    projectSlug: "${projectSlug}",
    formSlug: "${form.slug}",
    container: "#linkycal-form"
  });
</script>
\`\`\`

## Theme Customization

Match the widget to your brand:

\`\`\`javascript
LinkyCal.form({
  projectSlug: "${projectSlug}",
  formSlug: "${form.slug}",
  container: "#linkycal-form",
  theme: {
    primaryBg: "#1B4332",       // Primary button/accent background
    primaryText: "#ffffff",      // Text color on primary buttons
    backgroundColor: "#ffffff",  // Widget background color
    textColor: "#0f1a14",       // Main text color
    borderRadius: 16             // Corner roundness in pixels (0-32)
  }
});
\`\`\`

## Form Details
- **${form.name}**
- Type: ${form.type === "multi_step" ? "Multi-step form" : "Single page form"}
${form.steps ? `- ${form.steps.length} step(s)` : ""}
${form.steps?.map((s, i) => `- Step ${i + 1}: ${s.title || "Untitled"} (${s.fields.length} fields)`).join("\n") || ""}

## Widget Features
- Fully responsive — works on mobile, tablet, and desktop
${form.type === "multi_step" ? "- Multi-step navigation with progress indicator" : "- Single-page form with all fields visible"}
- Supports all field types: text, email, phone, select, radio, checkbox, rating, date, time, file upload
- Built-in validation for required fields and email format
- Automatic submission handling

## Integration Notes
- Place the \`<div>\` container wherever you want the form to appear on your page
- The script loads asynchronously and won't block your page rendering
- The widget is self-contained — no additional CSS or dependencies needed
- Multiple forms can coexist on the same page with different container IDs

## Documentation
- General docs: ${origin}/docs
- Form widget: ${origin}/docs#form-widget
- Native HTML form action: ${origin}/docs#native-html-form
- Forms API: ${origin}/docs#create-response

**Where on your website would you like to embed this form?** (e.g., contact page, signup page, feedback section)
`.trim();
}
