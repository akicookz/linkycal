import { z } from "zod";

import {
  ANALYTICS_DEVICE_TYPES,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_SOURCES,
  DETAILED_ANALYTICS_EVENT_NAMES,
  FUNNEL_STAGE_KINDS,
  FUNNEL_STAGE_OUTCOMES,
  FUNNEL_TYPES,
} from "../shared/funnel-analytics";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export const createTeamInviteSchema = z.object({
  email: z.string().email().max(320),
  teamRole: z.enum(["admin", "member"]).default("member"),
  projectId: z.string().optional(),
  projectRole: z.enum(["admin", "editor", "viewer"]).optional(),
});

export const updateTeamMemberSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const upsertProjectMemberSchema = z.object({
  teamMemberId: z.string().min(1),
  role: z.enum(["admin", "editor", "viewer"]),
});

export const updateProjectMemberSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});

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

export const customCssSchema = z.object({
  css: z.string().max(20 * 1024),
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
  bufferBefore: z.number().int().min(0).default(0),
  bufferAfter: z.number().int().min(0).default(0),
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  maxPerWeek: z.number().int().min(1).max(200).nullable().optional(),
  weekStart: z.enum(["monday", "sunday"]).default("monday"),
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
  bufferBefore: z.number().int().min(0).optional(),
  bufferAfter: z.number().int().min(0).optional(),
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  maxPerWeek: z.number().int().min(1).max(200).nullable().optional(),
  weekStart: z.enum(["monday", "sunday"]).optional(),
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
  inviteConnectionIds: z.array(z.string().min(1)).max(20).default([]),
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

export const publicAnalyticsCorrelationSchema = z
  .object({
    journeyId: z.uuid(),
    funnelType: z.enum(FUNNEL_TYPES),
    source: z.enum(ANALYTICS_SOURCES),
    deviceType: z.enum(ANALYTICS_DEVICE_TYPES),
    stageKey: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-zA-Z0-9._:-]+$/)
      .optional(),
    stageLabel: z.string().min(1).max(160).optional(),
    stageKind: z.enum(FUNNEL_STAGE_KINDS).optional(),
    stageOrder: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const bookingAnalyticsCorrelationSchema =
  publicAnalyticsCorrelationSchema.refine(
    function isBookingCorrelation(value) {
      return value.funnelType === "booking";
    },
    {
      path: ["funnelType"],
      message: "Booking analytics require the booking funnel type",
    },
  );

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
  analytics: bookingAnalyticsCorrelationSchema.optional(),
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
  notify: z.boolean().default(true),
});

export const reorderFieldsSchema = z.object({
  stepId: z.string().min(1),
  fieldIds: z.array(z.string().min(1)),
});

// ─── Conditions (shared by forms and workflows) ──────────────────────────────

const formConditionOperatorEnum = z.enum([
  "equals",
  "not_equals",
  "is_one_of",
  "is_not_one_of",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "gt",
  "lt",
  "gte",
  "lte",
]);

const workflowConditionOperatorEnum = z.enum([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "gt",
  "lt",
  "gte",
  "lte",
]);

const conditionMatchEnum = z.enum(["all", "any"]);

export const formConditionSchema = z.object({
  when: conditionMatchEnum.default("all"),
  rules: z
    .array(
      z.object({
        fieldId: z.string().min(1),
        operator: formConditionOperatorEnum,
        value: z
          .union([z.string(), z.number(), z.array(z.string())])
          .nullable()
          .optional(),
      }),
    )
    .max(20),
});

export const workflowConditionSchema = z.object({
  when: conditionMatchEnum.default("all"),
  rules: z
    .array(
      z.object({
        source: z.string().min(1).max(200),
        operator: workflowConditionOperatorEnum,
        value: z.union([z.string(), z.number()]).nullable().optional(),
      }),
    )
    .max(20),
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
  visibility: formConditionSchema.nullable().optional(),
});

export const updateFormStepSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  richDescription: z.string().max(10000).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  visibility: formConditionSchema.nullable().optional(),
});

export const createFormFieldSchema = z.object({
  stepId: z.string().min(1),
  sortOrder: z.number().int().min(0).optional(),
  type: z.enum([
    "name",
    "text",
    "textarea",
    "email",
    "phone",
    "url",
    "number",
    "select",
    "multi_select",
    "checkbox",
    "radio",
    "date",
    "time",
    "file",
    "rating",
    "completion",
  ]),
  label: z.string().min(1).max(200),
  description: z.string().max(10000).nullable().optional(),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().default(false),
  validation: z.record(z.string(), z.unknown()).optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  visibility: formConditionSchema.nullable().optional(),
  contactMapping: z.enum(["name", "email"]).nullable().optional(),
});

export const updateFormFieldSchema = z.object({
  stepId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
  type: z
    .enum([
      "name",
      "text",
      "textarea",
      "email",
      "phone",
      "url",
      "number",
      "select",
      "multi_select",
      "checkbox",
      "radio",
      "date",
      "time",
      "file",
      "rating",
      "completion",
    ])
    .optional(),
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  placeholder: z.string().max(200).nullable().optional(),
  required: z.boolean().optional(),
  validation: z.record(z.string(), z.unknown()).nullable().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .nullable()
    .optional(),
  contactMapping: z.enum(["name", "email"]).nullable().optional(),
  visibility: formConditionSchema.nullable().optional(),
});

export const submitFormStepSchema = z.object({
  fields: z.array(
    z.object({
      fieldId: z.string().min(1),
      value: z.string().nullable().optional(),
      fileUrl: z.string().min(1).max(2048).nullable().optional(),
    }),
  ),
  clearedFieldIds: z.array(z.string().min(1)).max(200).optional(),
  // Client-authoritative flag: true when the user is on their last visible
  // step. Needed because conditional steps can shrink the visible count below
  // the server-side step count, so the server can't derive completion from
  // stepIndex alone.
  complete: z.boolean().optional(),
  analytics: publicAnalyticsCorrelationSchema.optional(),
});

// ─── Contacts ────────────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(5000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  company: z.string().max(200).nullable().optional(),
  companyWebsite: z.string().max(500).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
  companySize: z.string().max(100).nullable().optional(),
  estimatedRevenue: z.string().max(100).nullable().optional(),
  linkedinUrl: z.string().max(500).nullable().optional(),
});

const contactImportMappingSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(200).optional(),
  notes: z.string().min(1).max(200).optional(),
});

export const importContactsSchema = z.object({
  mapping: contactImportMappingSchema,
  rows: z.array(z.record(z.string(), z.string().max(5000))).min(1).max(1000),
}).refine((value) => value.mapping.name || value.mapping.email, {
  message: "Map at least a name or email column",
  path: ["mapping"],
});

export const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  companyWebsite: z.string().max(500).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
  companySize: z.string().max(100).nullable().optional(),
  estimatedRevenue: z.string().max(100).nullable().optional(),
  linkedinUrl: z.string().max(500).nullable().optional(),
});

const nextActionValueSchema = z.object({
  text: z.string().trim().min(1).max(500),
  deadline: z.string().datetime({ offset: true }).nullable(),
});

const clearedNextActionSchema = z.object({
  text: z.null(),
  deadline: z.null(),
});

export const setNextActionSchema = z.union([
  nextActionValueSchema,
  clearedNextActionSchema,
]);

// ─── Tags ────────────────────────────────────────────────────────────────────

export const tagNameSchema = z.string().trim().min(1).max(50);
export const tagColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const createTagSchema = z.object({
  name: tagNameSchema,
  color: tagColorSchema.optional(),
});

export const updateTagSchema = z
  .object({
    name: tagNameSchema.optional(),
    color: tagColorSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: "At least one tag field is required",
  });

export const listTagsQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(1000).optional(),
  })
  .refine((data) => data.cursor === undefined || data.limit !== undefined, {
    message: "limit is required when cursor is provided",
  });

export const assignTagSchema = z.object({
  tagId: z.string().min(1),
});

export const setStageSchema = z.object({
  tagId: z.string().min(1).nullable(),
});

// ─── Contact Views ───────────────────────────────────────────────────────────

const activityTypeEnum = z.enum([
  "contact_created",
  "form_submitted",
  "booked",
  "cancelled",
  "tag_added",
  "tag_removed",
  "workflow_researched",
]);

const bookingStatusEnum = z.enum([
  "confirmed",
  "cancelled",
  "rescheduled",
  "pending",
  "declined",
]);

export const contactViewConfigSchema = z.object({
  search: z.string().max(200).optional(),
  tagIds: z.array(z.string()).optional(),
  matchAllTags: z.boolean().optional(),
  activityType: activityTypeEnum.optional(),
  activitySinceDays: z.number().int().min(0).max(3650).optional(),
  noActivitySinceDays: z.number().int().min(0).max(3650).optional(),
  bookingStatus: bookingStatusEnum.optional(),
  // Kanban-specific:
  pivotTagIds: z.array(z.string()).optional(),
  showUntagged: z.boolean().optional(),
});

export const createContactViewSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["list", "kanban"]),
  config: contactViewConfigSchema.optional(),
  sortOrder: z.number().int().optional(),
});

export const updateContactViewSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["list", "kanban"]).optional(),
  config: contactViewConfigSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
});

// ─── Workflows ───────────────────────────────────────────────────────────────

const workflowTriggerEnum = z.enum([
  "form_submitted",
  "booking_created",
  "booking_cancelled",
  "booking_pending",
  "booking_confirmed",
  "new_contact_created",
  "tag_added",
  "manual",
  "scheduled",
]);

const workflowScheduleSchema = z.object({
  frequency: z.enum(["hourly", "daily", "weekly", "monthly"]),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  timezone: z.string().max(64).optional(),
});

const workflowContactFilterSchema = z.object({
  tagIds: z.array(z.string().min(1)).max(20).default([]),
  matchAllTags: z.boolean().optional(),
});

export const workflowTriggerConfigSchema = z.object({
  schedule: workflowScheduleSchema.nullable().optional(),
  contactFilter: workflowContactFilterSchema.nullable().optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  trigger: workflowTriggerEnum,
  triggerConfig: workflowTriggerConfigSchema.nullable().optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  trigger: workflowTriggerEnum.optional(),
  triggerConfig: workflowTriggerConfigSchema.nullable().optional(),
  status: z.enum(["active", "draft"]).optional(),
});

const workflowStepTypeEnum = z.enum([
  "send_email",
  "ai_research",
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
  condition: workflowConditionSchema.nullable().optional(),
});

export const updateWorkflowStepSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  type: workflowStepTypeEnum.optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  condition: workflowConditionSchema.nullable().optional(),
});

// ─── API Keys ────────────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  label: z.string().max(100).optional(),
});

export const mcpOAuthDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("approve"),
      projectId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      decision: z.literal("deny"),
    })
    .strict(),
]);

// ─── Availability ────────────────────────────────────────────────────────────

export const checkAvailabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  timezone: z.string(),
  eventTypeSlug: z.string().min(1),
});

// ─── Billing ─────────────────────────────────────────────────────────────────

// ─── Analytics ───────────────────────────────────────────────────────────────

const analyticsSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/);
const analyticsDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(function isCalendarDate(value) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value;
  }, "Must be a valid calendar date");
const analyticsParamsSchema = z
  .record(
    z.string().min(1).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
    z.string().max(200),
  )
  .refine(function hasBoundedParamCount(value) {
    return Object.keys(value).length <= 20;
  }, "At most 20 custom parameters are allowed");

const funnelEventContextSchema = z
  .object({
    selectedDateUtc: z.iso.datetime({ offset: true }).optional(),
    fieldType: z.string().min(1).max(50).optional(),
    required: z.boolean().optional(),
    stageOutcome: z.enum(FUNNEL_STAGE_OUTCOMES).optional(),
  })
  .strict();

export const trackEventSchema = z
  .object({
    event: z.enum(ANALYTICS_EVENT_NAMES),
    projectSlug: analyticsSlugSchema,
    resourceSlug: analyticsSlugSchema.optional(),
    journeyId: z.uuid().optional(),
    funnelType: z.enum(FUNNEL_TYPES).optional(),
    stageKey: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-zA-Z0-9._:-]+$/)
      .optional(),
    stageLabel: z.string().min(1).max(160).optional(),
    stageKind: z.enum(FUNNEL_STAGE_KINDS).optional(),
    stageOrder: z.number().int().min(1).max(200).optional(),
    primaryValue: z.string().max(160).optional(),
    deviceType: z.enum(ANALYTICS_DEVICE_TYPES).optional(),
    source: z.enum(ANALYTICS_SOURCES).optional(),
    slotCount: z.number().int().min(0).max(48).optional(),
    daysAhead: z.number().int().min(0).max(730).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    context: funnelEventContextSchema.optional(),
    utmSource: z.string().max(200).optional(),
    utmMedium: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
    utmTerm: z.string().max(200).optional(),
    utmContent: z.string().max(200).optional(),
    referrer: z.string().max(2000).optional(),
    params: analyticsParamsSchema.optional(),
  })
  .strict()
  .superRefine(function validateDetailedEventIdentity(value, ctx) {
    const detailedEvents = new Set<string>(DETAILED_ANALYTICS_EVENT_NAMES);
    if (!detailedEvents.has(value.event)) return;

    const requiredFields = [
      "journeyId",
      "funnelType",
      "stageKey",
      "stageLabel",
      "stageKind",
      "stageOrder",
      "deviceType",
      "source",
    ] as const;
    for (const field of requiredFields) {
      if (value[field] !== undefined) continue;
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${field} is required for detailed analytics events`,
      });
    }
  });

export const trackEventRequestSchema = z.union([
  trackEventSchema,
  z.object({ events: z.array(trackEventSchema).min(1).max(20) }).strict(),
]);

export const configureAnalyticsIntegrationSchema = z.discriminatedUnion(
  "provider",
  [
    z
      .object({
        provider: z.literal("ga4"),
        enabled: z.boolean(),
        measurementId: z
          .string()
          .regex(/^G-[A-Z0-9]{4,20}$/)
          .optional(),
      })
      .strict(),
    z
      .object({
        provider: z.literal("meta_pixel"),
        enabled: z.boolean(),
        pixelId: z.string().regex(/^\d{5,30}$/).optional(),
      })
      .strict(),
    z
      .object({
        provider: z.literal("posthog"),
        enabled: z.boolean(),
        projectKey: z
          .string()
          .regex(/^phc_[A-Za-z0-9_-]{10,200}$/)
          .optional(),
        host: z.enum(["us", "eu"]).optional(),
      })
      .strict(),
  ],
);

export const analyticsQuerySchema = z
  .object({
    period: z.enum(["7d", "30d", "90d", "custom"]).default("30d"),
    start: analyticsDateSchema.optional(),
    end: analyticsDateSchema.optional(),
    utmSource: z.string().max(200).optional(),
    utmMedium: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
    resourceSlug: analyticsSlugSchema.optional(),
    source: z.enum(ANALYTICS_SOURCES).optional(),
    deviceType: z.enum(ANALYTICS_DEVICE_TYPES).optional(),
    groupBy: z
      .enum([
        "source",
        "device",
        "country",
        "resource",
        "utm_source",
        "utm_medium",
        "utm_campaign",
      ])
      .optional(),
  })
  .strict()
  .superRefine(function validateAnalyticsRange(value, ctx) {
    if (value.period === "custom") {
      if (!value.start || !value.end) {
        ctx.addIssue({
          code: "custom",
          message: "Custom periods require start and end dates",
        });
        return;
      }
      if (value.start > value.end) {
        ctx.addIssue({
          code: "custom",
          message: "Start date must not be after end date",
        });
      }
      return;
    }

    if (value.start || value.end) {
      ctx.addIssue({
        code: "custom",
        message: "Start and end dates are accepted only for custom periods",
      });
    }
  });

export const analyticsTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(function isIanaTimezone(value) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Must be a valid IANA timezone");

export const bookingAnalyticsQuerySchema = analyticsQuerySchema.safeExtend({
  timezone: analyticsTimezoneSchema,
});

// ─── Billing ─────────────────────────────────────────────────────────────────

export const checkoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["month", "year"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
