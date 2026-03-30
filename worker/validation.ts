import { z } from "zod";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  timezone: z.string().default("America/New_York"),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  timezone: z.string().optional(),
  onboarded: z.boolean().optional(),
});

// ─── Event Types ─────────────────────────────────────────────────────────────

export const createEventTypeSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  duration: z.number().int().min(5).max(480).default(30),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bufferBefore: z.number().int().min(0).max(120).default(0),
  bufferAfter: z.number().int().min(0).max(120).default(0),
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  enabled: z.boolean().default(true),
  requiresConfirmation: z.boolean().default(false),
  bookingFormId: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  copyFromEventTypeId: z.string().optional(),
});

export const updateEventTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  duration: z.number().int().min(5).max(480).optional(),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bufferBefore: z.number().int().min(0).max(120).optional(),
  bufferAfter: z.number().int().min(0).max(120).optional(),
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  enabled: z.boolean().optional(),
  requiresConfirmation: z.boolean().optional(),
  bookingFormId: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── Event Type Calendars ─────────────────────────────────────────────────────

const calendarRefSchema = z.object({
  connectionId: z.string().min(1),
  calendarId: z.string().min(1),
});

export const updateEventTypeCalendarsSchema = z.object({
  destination: calendarRefSchema.nullable(),
  busyCalendars: z.array(calendarRefSchema).max(20),
});

// ─── Schedules ───────────────────────────────────────────────────────────────

export const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  timezone: z.string().default("America/New_York"),
  isDefault: z.boolean().default(false),
});

const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm format"),
  endTime: z
    .string()
    .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "Must be HH:mm format"),
})
  .refine(
    (value) => timeToMinutes(value.startTime) < timeToMinutes(value.endTime),
    {
      message: "End time must be after start time",
      path: ["endTime"],
    },
  );

export const updateAvailabilityRulesSchema = z.object({
  rules: z.array(availabilityRuleSchema).min(0).max(56),
}).superRefine((value, ctx) => {
  const rulesByDay = new Map<number, typeof value.rules>();

  for (const rule of value.rules) {
    const dayRules = rulesByDay.get(rule.dayOfWeek) ?? [];
    dayRules.push(rule);
    rulesByDay.set(rule.dayOfWeek, dayRules);
  }

  for (const [dayOfWeek, dayRules] of rulesByDay.entries()) {
    const sortedRules = [...dayRules].sort(
      (left, right) =>
        timeToMinutes(left.startTime) - timeToMinutes(right.startTime),
    );

    for (let index = 1; index < sortedRules.length; index += 1) {
      const previousRule = sortedRules[index - 1];
      const currentRule = sortedRules[index];

      if (
        timeToMinutes(currentRule.startTime) <=
        timeToMinutes(previousRule.endTime)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Availability blocks for day ${dayOfWeek} must not overlap`,
          path: ["rules"],
        });
        return;
      }
    }
  }
});

// ─── Bookings ────────────────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  eventTypeSlug: z.string().min(1),
  projectSlug: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  notes: z.string().max(2000).optional(),
  startTime: z.string().datetime(),
  timezone: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  formFields: z.record(z.string(), z.string()).optional(),
});

function timeToMinutes(time: string): number {
  if (time === "24:00") return 24 * 60;

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const declineBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const reorderFieldsSchema = z.object({
  stepId: z.string().min(1),
  fieldIds: z.array(z.string().min(1)),
});

// ─── Forms ───────────────────────────────────────────────────────────────────

export const createFormSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  type: z.enum(["multi_step", "single"]).default("single"),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const updateFormSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  type: z.enum(["multi_step", "single"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createFormStepSchema = z.object({
  sortOrder: z.number().int().min(0).default(0),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  richDescription: z.string().max(10000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const updateFormStepSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  richDescription: z.string().max(10000).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createFormFieldSchema = z.object({
  stepId: z.string().min(1),
  sortOrder: z.number().int().min(0).optional(),
  type: z.enum([
    "text",
    "textarea",
    "email",
    "phone",
    "number",
    "select",
    "multi_select",
    "checkbox",
    "radio",
    "date",
    "time",
    "file",
    "rating",
  ]),
  label: z.string().min(1).max(200),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().default(false),
  validation: z.record(z.string(), z.unknown()).optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});

export const updateFormFieldSchema = z.object({
  stepId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
  type: z
    .enum([
      "text",
      "textarea",
      "email",
      "phone",
      "number",
      "select",
      "multi_select",
      "checkbox",
      "radio",
      "date",
      "time",
      "file",
      "rating",
    ])
    .optional(),
  label: z.string().min(1).max(200).optional(),
  placeholder: z.string().max(200).nullable().optional(),
  required: z.boolean().optional(),
  validation: z.record(z.string(), z.unknown()).nullable().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .nullable()
    .optional(),
});

export const submitFormStepSchema = z.object({
  fields: z.array(
    z.object({
      fieldId: z.string().min(1),
      value: z.string().nullable().optional(),
      fileUrl: z.string().url().nullable().optional(),
    }),
  ),
});

// ─── Contacts ────────────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(5000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── Tags ────────────────────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// ─── Workflows ───────────────────────────────────────────────────────────────

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  trigger: z.enum([
    "form_submitted",
    "booking_created",
    "booking_cancelled",
    "booking_pending",
    "booking_confirmed",
    "tag_added",
    "manual",
  ]),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  trigger: z
    .enum([
      "form_submitted",
      "booking_created",
      "booking_cancelled",
      "booking_pending",
      "booking_confirmed",
      "tag_added",
      "manual",
    ])
    .optional(),
  status: z.enum(["active", "draft"]).optional(),
});

const workflowStepTypeEnum = z.enum([
  "send_email",
  "add_tag",
  "remove_tag",
  "wait",
  "condition",
  "webhook",
  "update_contact",
]);

export const createWorkflowStepSchema = z.object({
  sortOrder: z.number().int().min(0).default(0),
  type: workflowStepTypeEnum,
  config: z.record(z.string(), z.unknown()).optional(),
});

export const updateWorkflowStepSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  type: workflowStepTypeEnum.optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── API Keys ────────────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  label: z.string().max(100).optional(),
});

// ─── Availability ────────────────────────────────────────────────────────────

export const checkAvailabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  timezone: z.string(),
  eventTypeSlug: z.string().min(1),
});

// ─── Billing ─────────────────────────────────────────────────────────────────

export const checkoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["month", "year"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
