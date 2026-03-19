// ─── Prompt Generation for Copy Prompt Feature ──────────────────────────────

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
  fields: FormFieldForPrompt[];
}

interface FormForPrompt {
  name: string;
  slug: string;
  type: string;
  steps?: FormStepForPrompt[];
}

// ─── Event Type Prompts ─────────────────────────────────────────────────────

export function generateEventTypeApiPrompt(
  et: EventTypeForPrompt,
  projectSlug: string,
  origin: string,
  bookingFormFields?: FormFieldForPrompt[],
): string {
  let prompt = `# LinkyCal Booking API — "${et.name}"

## Event Type Details
- Name: ${et.name}
- Slug: ${et.slug}
- Duration: ${et.duration} minutes
- Location: ${et.location || "Not specified"}
- Description: ${et.description || "None"}
- Requires Confirmation: ${et.requiresConfirmation ? "Yes" : "No"}
- Buffer: ${et.bufferBefore}min before, ${et.bufferAfter}min after
${et.maxPerDay ? `- Max bookings per day: ${et.maxPerDay}` : ""}

## 1. Check Available Time Slots

\`\`\`
GET ${origin}/api/v1/availability/${projectSlug}?date=YYYY-MM-DD&timezone=America/New_York&eventTypeSlug=${et.slug}
\`\`\`

### Query Parameters
| Parameter | Required | Description |
|-----------|----------|-------------|
| date | Yes | Date in YYYY-MM-DD format |
| timezone | Yes | IANA timezone (e.g. America/New_York, Europe/London) |
| eventTypeSlug | Yes | \`${et.slug}\` |

### Response
\`\`\`json
{
  "slots": [
    { "start": "2025-01-15T14:00:00Z", "end": "2025-01-15T14:30:00Z" },
    { "start": "2025-01-15T14:30:00Z", "end": "2025-01-15T15:00:00Z" }
  ],
  "date": "2025-01-15",
  "timezone": "America/New_York"
}
\`\`\`

## 2. Create a Booking

\`\`\`
POST ${origin}/api/v1/bookings
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
\`\`\`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| projectSlug | string | Yes | \`${projectSlug}\` |
| eventTypeSlug | string | Yes | \`${et.slug}\` |
| name | string | Yes | Guest's full name |
| email | string | Yes | Guest's email address |
| startTime | string | Yes | ISO 8601 datetime from available slots |
| timezone | string | Yes | Guest's IANA timezone |
| notes | string | No | Optional notes from the guest |
${et.bookingFormId ? "| formFields | object | Yes | Key-value pairs of form field IDs to values (see below) |" : ""}

### Example Request
\`\`\`json
{
  "projectSlug": "${projectSlug}",
  "eventTypeSlug": "${et.slug}",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "startTime": "2025-01-15T14:00:00Z",
  "timezone": "America/New_York",
  "notes": "Looking forward to our meeting"${et.bookingFormId ? `,
  "formFields": { ... }` : ""}
}
\`\`\`

### Response
\`\`\`json
{
  "booking": {
    "id": "uuid",
    "status": "${et.requiresConfirmation ? "pending" : "confirmed"}",
    "startTime": "2025-01-15T14:00:00Z",
    "endTime": "2025-01-15T14:30:00Z"
  }
}
\`\`\`
`;

  if (et.requiresConfirmation) {
    prompt += `
> **Note:** This event type requires confirmation. Bookings will be in "pending" status until the host approves. The guest will receive a confirmation email once approved.
`;
  }

  if (bookingFormFields && bookingFormFields.length > 0) {
    prompt += `
## Booking Form Fields

This event type requires additional form fields to be submitted with the booking via the \`formFields\` object.

| Field ID | Label | Type | Required | Options |
|----------|-------|------|----------|---------|
`;
    for (const field of bookingFormFields) {
      const options = field.options?.map((o) => o.label).join(", ") || "—";
      prompt += `| (use actual field ID) | ${field.label} | ${field.type} | ${field.required ? "Yes" : "No"} | ${options} |\n`;
    }
  }

  prompt += `
## Authentication

Include your API key in the Authorization header:
\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

Generate your API key in the LinkyCal dashboard under Settings > API Keys.

## Integration Tips

1. First call the availability endpoint to get available time slots for a given date
2. Present the slots to your user and let them pick one
3. Submit the booking with the selected slot's \`start\` time
4. Handle the response — check \`booking.status\` for "confirmed" or "pending"
5. On your website/app, where would you like to integrate this booking flow?
`;

  return prompt.trim();
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
  // Collect all fields across all steps for the example body
  const firstStepFields = form.steps?.[0]?.fields ?? [];

  // Generate example values based on field type
  function exampleValue(field: FormFieldForPrompt): string {
    switch (field.type) {
      case "email": return "jane@example.com";
      case "phone": return "+1 (555) 123-4567";
      case "number": return "42";
      case "date": return "2025-03-15";
      case "time": return "14:30";
      case "rating": return "5";
      case "checkbox": return "true";
      case "textarea": return "I need help with...";
      case "select":
      case "radio":
        return field.options?.[0]?.value ?? "option_1";
      case "multi_select":
        return field.options?.slice(0, 2).map((o) => o.value).join(",") ?? "option_1,option_2";
      default: return "Jane Smith";
    }
  }

  let prompt = `# LinkyCal Form API — "${form.name}"

## Form Details
- Name: ${form.name}
- Slug: ${form.slug}
- Type: ${form.type === "multi_step" ? "Multi-step" : "Single step"}
${form.steps ? `- Steps: ${form.steps.length}` : ""}
- Authentication: None required (public endpoint)

## 1. Start a Form Response

\`\`\`
POST ${origin}/api/v1/forms/${form.slug}/responses?projectSlug=${projectSlug}
Content-Type: application/json
\`\`\`

### Response
\`\`\`json
{
  "response": {
    "id": "response-uuid",
    "formId": "form-uuid",
    "status": "in_progress",
    "currentStepIndex": 0
  }
}
\`\`\`

## 2. Submit Each Step

For each step (0-indexed), submit the field values:

\`\`\`
PATCH ${origin}/api/v1/forms/${form.slug}/responses/{responseId}/steps/{stepIndex}
Content-Type: application/json
\`\`\`
`;

  // Generate example body using real field IDs from step 1
  if (firstStepFields.length > 0) {
    const exampleFields = firstStepFields
      .map((f) => `    { "fieldId": "${f.id}", "value": "${exampleValue(f)}" }`)
      .join(",\n");

    prompt += `
### Example Request Body (Step 0)
\`\`\`json
{
  "fields": [
${exampleFields}
  ]
}
\`\`\`
`;
  } else {
    prompt += `
### Request Body
\`\`\`json
{
  "fields": [
    { "fieldId": "field_id", "value": "user input" }
  ]
}
\`\`\`
`;
  }

  prompt += `
### Response
\`\`\`json
{
  "response": {
    "id": "response-uuid",
    "currentStepIndex": 1,
    "status": "in_progress"
  }
}
\`\`\`

The response status changes to \`"completed"\` after the last step is submitted.
`;

  if (form.steps && form.steps.length > 0) {
    prompt += `\n## Form Structure\n`;

    for (let i = 0; i < form.steps.length; i++) {
      const step = form.steps[i];
      prompt += `\n### Step ${i + 1} (stepIndex: ${i})${step.title ? ` — ${step.title}` : ""}
${step.description ? `${step.description}\n` : ""}
| Field ID | Label | Type | Required | Options |
|----------|-------|------|----------|---------|
`;
      for (const field of step.fields) {
        const options = field.options?.map((o) => `\`${o.value}\``).join(", ") || "—";
        prompt += `| \`${field.id}\` | ${field.label} | ${field.type} | ${field.required ? "Yes" : "No"} | ${options} |\n`;
      }
    }
  }

  prompt += `
## Field Types Reference

| Type | Input | Value Format |
|------|-------|-------------|
| text | Text input | Plain string |
| textarea | Multi-line text | Plain string |
| email | Email input | Valid email address |
| phone | Phone input | Phone number string |
| number | Number input | Numeric string |
| date | Date picker | YYYY-MM-DD |
| time | Time picker | HH:mm |
| select | Dropdown | One of the option values listed above |
| multi_select | Checkboxes | Comma-separated option values |
| radio | Radio buttons | One of the option values listed above |
| checkbox | Single checkbox | \`"true"\` or \`""\` |
| rating | Star rating (1-5) | \`"1"\` to \`"5"\` |

## Complete Integration Example

\`\`\`bash
# 1. Start a response
curl -X POST "${origin}/api/v1/forms/${form.slug}/responses?projectSlug=${projectSlug}" \\
  -H "Content-Type: application/json"

# Save the response ID from the result: response.id

# 2. Submit step 0
curl -X PATCH "${origin}/api/v1/forms/${form.slug}/responses/RESPONSE_ID/steps/0" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ fields: firstStepFields.map((f) => ({ fieldId: f.id, value: exampleValue(f) })) })}'
\`\`\`
${form.steps && form.steps.length > 1 ? `\nRepeat step 2 for each additional step (1 through ${form.steps.length - 1}).\n` : ""}
**Where in your application would you like to collect this form data?**
`;

  return prompt.trim();
}

export function generateFormEmbedPrompt(
  form: FormForPrompt,
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
    formSlug: "${form.slug}",
    container: "#linkycal-form"
  });
</script>
\`\`\`

## Theme Customization

Match the widget to your brand:

\`\`\`javascript
LinkyCal.form({
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

**Where on your website would you like to embed this form?** (e.g., contact page, signup page, feedback section)
`.trim();
}
