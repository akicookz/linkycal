import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import * as authSchema from "./auth.schema";

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    onboarded: integer("onboarded", { mode: "boolean" }).notNull().default(false),
    settings: text("settings"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("projects_user_id_idx").on(t.userId),
    uniqueIndex("projects_slug_idx").on(t.slug),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

// ─── Event Types ─────────────────────────────────────────────────────────────

export const eventTypes = sqliteTable(
  "event_types",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    duration: integer("duration").notNull().default(30),
    description: text("description"),
    location: text("location"),
    color: text("color").default("#3b82f6"),
    bufferBefore: integer("buffer_before").notNull().default(0),
    bufferAfter: integer("buffer_after").notNull().default(0),
    maxPerDay: integer("max_per_day"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    scheduleId: text("schedule_id").references(() => schedules.id, {
      onDelete: "set null",
    }),
    destinationConnectionId: text("destination_connection_id").references(
      () => calendarConnections.id,
      { onDelete: "set null" },
    ),
    destinationCalendarId: text("destination_calendar_id"),
    requiresConfirmation: integer("requires_confirmation", { mode: "boolean" })
      .notNull()
      .default(false),
    bookingFormId: text("booking_form_id").references(() => forms.id, {
      onDelete: "set null",
    }),
    settings: text("settings", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("event_types_project_id_idx").on(t.projectId),
    uniqueIndex("event_types_project_slug_idx").on(t.projectId, t.slug),
  ],
);

export type EventTypeRow = typeof eventTypes.$inferSelect;
export type NewEventTypeRow = typeof eventTypes.$inferInsert;

// ─── Schedules ───────────────────────────────────────────────────────────────

export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("schedules_project_id_idx").on(t.projectId)],
);

export type ScheduleRow = typeof schedules.$inferSelect;
export type NewScheduleRow = typeof schedules.$inferInsert;

// ─── Availability Rules ─────────────────────────────────────────────────────

export const availabilityRules = sqliteTable(
  "availability_rules",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("availability_rules_schedule_id_idx").on(t.scheduleId)],
);

export type AvailabilityRuleRow = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRuleRow = typeof availabilityRules.$inferInsert;

// ─── Schedule Overrides ─────────────────────────────────────────────────────

export const scheduleOverrides = sqliteTable(
  "schedule_overrides",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("schedule_overrides_schedule_id_idx").on(t.scheduleId)],
);

export type ScheduleOverrideRow = typeof scheduleOverrides.$inferSelect;
export type NewScheduleOverrideRow = typeof scheduleOverrides.$inferInsert;

// ─── Contacts ────────────────────────────────────────────────────────────────

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("contacts_project_id_idx").on(t.projectId),
    index("contacts_email_idx").on(t.email),
  ],
);

export type ContactRow = typeof contacts.$inferSelect;
export type NewContactRow = typeof contacts.$inferInsert;

// ─── Bookings ────────────────────────────────────────────────────────────────

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    notes: text("notes"),
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp" }).notNull(),
    timezone: text("timezone").notNull(),
    status: text("status", {
      enum: ["confirmed", "cancelled", "rescheduled", "pending", "declined"],
    })
      .notNull()
      .default("confirmed"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    formResponseId: text("form_response_id").references(
      () => formResponses.id,
      { onDelete: "set null" },
    ),
    gcalEventId: text("gcal_event_id"),
    meetingUrl: text("meeting_url"),
    ipAddress: text("ip_address"),
    country: text("country"),
    city: text("city"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("bookings_event_type_id_idx").on(t.eventTypeId),
    index("bookings_contact_id_idx").on(t.contactId),
    index("bookings_start_time_idx").on(t.startTime),
  ],
);

export type BookingRow = typeof bookings.$inferSelect;
export type NewBookingRow = typeof bookings.$inferInsert;

// ─── Forms ───────────────────────────────────────────────────────────────────

export const forms = sqliteTable(
  "forms",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: text("type", { enum: ["multi_step", "single"] })
      .notNull()
      .default("single"),
    status: text("status", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    settings: text("settings", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("forms_project_id_idx").on(t.projectId),
    uniqueIndex("forms_project_slug_idx").on(t.projectId, t.slug),
    uniqueIndex("forms_slug_unique_idx").on(t.slug),
  ],
);

export type FormRow = typeof forms.$inferSelect;
export type NewFormRow = typeof forms.$inferInsert;

// ─── Form Steps ──────────────────────────────────────────────────────────────

export const formSteps = sqliteTable(
  "form_steps",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    title: text("title"),
    description: text("description"),
    richDescription: text("rich_description"),
    settings: text("settings", { mode: "json" }),
    visibility: text("visibility", { mode: "json" }),
  },
  (t) => [index("form_steps_form_id_idx").on(t.formId)],
);

export type FormStepRow = typeof formSteps.$inferSelect;
export type NewFormStepRow = typeof formSteps.$inferInsert;

// ─── Form Fields ─────────────────────────────────────────────────────────────

export const formFields = sqliteTable(
  "form_fields",
  {
    id: text("id").primaryKey(),
    stepId: text("step_id")
      .notNull()
      .references(() => formSteps.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    type: text("type", {
      enum: [
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
      ],
    }).notNull(),
    label: text("label").notNull(),
    description: text("description"),
    placeholder: text("placeholder"),
    required: integer("required", { mode: "boolean" }).notNull().default(false),
    validation: text("validation", { mode: "json" }),
    options: text("options", { mode: "json" }),
    visibility: text("visibility", { mode: "json" }),
    contactMapping: text("contact_mapping", {
      enum: ["name", "email"],
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("form_fields_step_id_idx").on(t.stepId)],
);

export type FormFieldRow = typeof formFields.$inferSelect;
export type NewFormFieldRow = typeof formFields.$inferInsert;

// ─── Form Responses ──────────────────────────────────────────────────────────

export const formResponses = sqliteTable(
  "form_responses",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .references(() => forms.id, { onDelete: "set null" }),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    status: text("status", {
      enum: ["in_progress", "completed", "abandoned"],
    })
      .notNull()
      .default("in_progress"),
    respondentEmail: text("respondent_email"),
    ipAddress: text("ip_address"),
    country: text("country"),
    city: text("city"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("form_responses_form_id_idx").on(t.formId)],
);

export type FormResponseRow = typeof formResponses.$inferSelect;
export type NewFormResponseRow = typeof formResponses.$inferInsert;

// ─── Form Field Values ──────────────────────────────────────────────────────

export const formFieldValues = sqliteTable(
  "form_field_values",
  {
    id: text("id").primaryKey(),
    responseId: text("response_id")
      .notNull()
      .references(() => formResponses.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => formFields.id, { onDelete: "cascade" }),
    value: text("value"),
    fileUrl: text("file_url"),
  },
  (t) => [
    index("form_field_values_response_id_idx").on(t.responseId),
    index("form_field_values_field_id_idx").on(t.fieldId),
  ],
);

export type FormFieldValueRow = typeof formFieldValues.$inferSelect;
export type NewFormFieldValueRow = typeof formFieldValues.$inferInsert;

// ─── Tags ────────────────────────────────────────────────────────────────────

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#6b7280"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("tags_project_id_idx").on(t.projectId)],
);

export type TagRow = typeof tags.$inferSelect;
export type NewTagRow = typeof tags.$inferInsert;

// ─── Contact Tags ────────────────────────────────────────────────────────────

export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] })],
);

export type ContactTagRow = typeof contactTags.$inferSelect;
export type NewContactTagRow = typeof contactTags.$inferInsert;

// ─── Contact Activity ───────────────────────────────────────────────────────

export const contactActivity = sqliteTable(
  "contact_activity",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "form_submitted",
        "booked",
        "cancelled",
        "tag_added",
        "tag_removed",
        "workflow_researched",
      ],
    }).notNull(),
    referenceId: text("reference_id"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("contact_activity_contact_id_idx").on(t.contactId)],
);

export type ContactActivityRow = typeof contactActivity.$inferSelect;
export type NewContactActivityRow = typeof contactActivity.$inferInsert;

// ─── Contact Views ───────────────────────────────────────────────────────────

export const contactViews = sqliteTable(
  "contact_views",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["list", "kanban"] })
      .notNull()
      .default("list"),
    config: text("config", { mode: "json" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("contact_views_project_id_idx").on(t.projectId)],
);

export type ContactViewRow = typeof contactViews.$inferSelect;
export type NewContactViewRow = typeof contactViews.$inferInsert;

// ─── Calendar Connections ───────────────────────────────────────────────────

export const calendarConnections = sqliteTable(
  "calendar_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google"] }).notNull().default("google"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    email: text("email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("calendar_connections_user_id_idx").on(t.userId)],
);

export type CalendarConnectionRow = typeof calendarConnections.$inferSelect;
export type NewCalendarConnectionRow = typeof calendarConnections.$inferInsert;

// ─── Event Type Busy Calendars ──────────────────────────────────────────────

export const eventTypeBusyCalendars = sqliteTable(
  "event_type_busy_calendars",
  {
    id: text("id").primaryKey(),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => calendarConnections.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
  },
  (t) => [index("event_type_busy_calendars_event_type_id_idx").on(t.eventTypeId)],
);

export type EventTypeBusyCalendarRow = typeof eventTypeBusyCalendars.$inferSelect;
export type NewEventTypeBusyCalendarRow = typeof eventTypeBusyCalendars.$inferInsert;

// ─── Workflows ───────────────────────────────────────────────────────────────

export const workflows = sqliteTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: text("trigger", {
      enum: [
        "form_submitted",
        "booking_created",
        "booking_cancelled",
        "booking_pending",
        "booking_confirmed",
        "tag_added",
        "manual",
      ],
    }).notNull(),
    status: text("status", { enum: ["active", "draft"] })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("workflows_project_id_idx").on(t.projectId)],
);

export type WorkflowRow = typeof workflows.$inferSelect;
export type NewWorkflowRow = typeof workflows.$inferInsert;

// ─── Workflow Steps ──────────────────────────────────────────────────────────

export const workflowSteps = sqliteTable(
  "workflow_steps",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    type: text("type", {
      enum: [
        "send_email",
        "ai_research",
        "add_tag",
        "remove_tag",
        "wait",
        "condition",
        "webhook",
        "update_contact",
      ],
    }).notNull(),
    config: text("config", { mode: "json" }),
    condition: text("condition", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("workflow_steps_workflow_id_idx").on(t.workflowId)],
);

export type WorkflowStepRow = typeof workflowSteps.$inferSelect;
export type NewWorkflowStepRow = typeof workflowSteps.$inferInsert;

// ─── Workflow Runs ───────────────────────────────────────────────────────────

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    triggerId: text("trigger_id"),
    context: text("context"),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    })
      .notNull()
      .default("running"),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    error: text("error"),
    stepLogs: text("step_logs", { mode: "json" }),
  },
  (t) => [index("workflow_runs_workflow_id_idx").on(t.workflowId)],
);

export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type NewWorkflowRunRow = typeof workflowRuns.$inferInsert;

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    plan: text("plan", { enum: ["free", "pro", "business"] })
      .notNull()
      .default("free"),
    interval: text("interval", { enum: ["monthly", "annual"] })
      .notNull()
      .default("monthly"),
    status: text("status", {
      enum: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
      ],
    })
      .notNull()
      .default("active"),
    currentPeriodStart: integer("current_period_start", { mode: "timestamp" }),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("subscriptions_user_id_idx").on(t.userId),
    uniqueIndex("subscriptions_user_id_unique").on(t.userId),
    uniqueIndex("subscriptions_stripe_sub_id_idx").on(t.stripeSubscriptionId),
  ],
);

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;

// ─── Usage ───────────────────────────────────────────────────────────────────

export const usage = sqliteTable(
  "usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.users.id, { onDelete: "cascade" }),
    periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
    formResponses: integer("form_responses").notNull().default(0),
    bookingsCount: integer("bookings_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("usage_user_id_idx").on(t.userId)],
);

export type UsageRow = typeof usage.$inferSelect;
export type NewUsageRow = typeof usage.$inferInsert;

// ─── API Keys ────────────────────────────────────────────────────────────────

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    label: text("label"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("api_keys_project_id_idx").on(t.projectId)],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;

// ─── Unified Schema ─────────────────────────────────────────────────────────

export const schema = {
  ...authSchema,
  projects,
  eventTypes,
  schedules,
  availabilityRules,
  scheduleOverrides,
  contacts,
  bookings,
  forms,
  formSteps,
  formFields,
  formResponses,
  formFieldValues,
  tags,
  contactTags,
  contactActivity,
  contactViews,
  calendarConnections,
  eventTypeBusyCalendars,
  workflows,
  workflowSteps,
  workflowRuns,
  subscriptions,
  usage,
  apiKeys,
};
