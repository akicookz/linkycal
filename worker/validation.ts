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
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
});

export const updateAvailabilityRulesSchema = z.object({
  rules: z.array(availabilityRuleSchema).min(0).max(28),
});

// ─── Bookings ────────────────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  eventTypeSlug: z.string().min(1),
  projectSlug: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(2000).optional(),
  startTime: z.string().datetime(),
  timezone: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const declineBookingSchema = z.object({
  reason: z.string().max(500).optional(),
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
  settings: z.record(z.string(), z.unknown()).optional(),
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
      "tag_added",
      "manual",
    ])
    .optional(),
  status: z.enum(["active", "draft"]).optional(),
});

export const createWorkflowStepSchema = z.object({
  sortOrder: z.number().int().min(0).default(0),
  type: z.enum([
    "send_email",
    "add_tag",
    "remove_tag",
    "wait",
    "condition",
    "webhook",
    "update_contact",
  ]),
  config: z.record(z.string(), z.unknown()).optional(),
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
