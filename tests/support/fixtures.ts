import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../../worker/db/schema";

export const FIXTURE_IDS = {
  owner: "owner-aki",
  project: "project-acme",
  schedule: "schedule-new-york",
  eventType: "event-discovery",
  destinationConnection: "calendar-destination",
  inviteConnection: "calendar-invite",
  booking: "booking-existing",
} as const;

export const WORKFLOW_FIXTURE_IDS = {
  owner: "owner-workflow",
  project: "project-workflow",
  contact: "contact-hanna",
  tag: "tag-qualified",
  booking: "booking-northstar",
} as const;

export const CROSS_TIMEZONE_SLOT_ISO = "2026-03-23T13:00:00.000Z";

export const CROSS_TIMEZONE_VIEWERS = [
  {
    timezone: "Europe/Berlin",
    date: "2026-03-23",
    localTime: "14:00",
    startLabel: "2:00 PM",
    endLabel: "2:30 PM",
  },
  {
    timezone: "Europe/Helsinki",
    date: "2026-03-23",
    localTime: "15:00",
    startLabel: "3:00 PM",
    endLabel: "3:30 PM",
  },
  {
    timezone: "Europe/Guernsey",
    date: "2026-03-23",
    localTime: "13:00",
    startLabel: "1:00 PM",
    endLabel: "1:30 PM",
  },
  {
    timezone: "Asia/Kathmandu",
    date: "2026-03-23",
    localTime: "18:45",
    startLabel: "6:45 PM",
    endLabel: "7:15 PM",
  },
  {
    timezone: "Asia/Seoul",
    date: "2026-03-23",
    localTime: "22:00",
    startLabel: "10:00 PM",
    endLabel: "10:30 PM",
  },
  {
    timezone: "Pacific/Kiritimati",
    date: "2026-03-24",
    localTime: "03:00",
    startLabel: "3:00 AM",
    endLabel: "3:30 AM",
  },
  {
    timezone: "Pacific/Pago_Pago",
    date: "2026-03-23",
    localTime: "02:00",
    startLabel: "2:00 AM",
    endLabel: "2:30 AM",
  },
] as const;

interface AvailabilityScenarioOverrides {
  schedule?: Partial<dbSchema.NewScheduleRow>;
  rule?: Partial<dbSchema.NewAvailabilityRuleRow>;
  eventType?: Partial<dbSchema.NewEventTypeRow>;
}

export async function seedAvailabilityScenario(
  db: DrizzleD1Database<Record<string, unknown>>,
  overrides: AvailabilityScenarioOverrides = {},
): Promise<void> {
  await db.insert(dbSchema.schema.users).values({
    id: FIXTURE_IDS.owner,
    name: "Aki Owner",
    email: "aki@encited.com",
  });
  await db.insert(dbSchema.projects).values({
    id: FIXTURE_IDS.project,
    userId: FIXTURE_IDS.owner,
    name: "Acme",
    slug: "acme",
    timezone: "America/New_York",
  });
  await db.insert(dbSchema.schedules).values({
    id: FIXTURE_IDS.schedule,
    projectId: FIXTURE_IDS.project,
    name: "New York office hours",
    timezone: "America/New_York",
    isDefault: true,
    ...overrides.schedule,
  });
  await db.insert(dbSchema.availabilityRules).values({
    id: "rule-monday",
    scheduleId: FIXTURE_IDS.schedule,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "09:30",
    ...overrides.rule,
  });
  await db.insert(dbSchema.eventTypes).values({
    id: FIXTURE_IDS.eventType,
    projectId: FIXTURE_IDS.project,
    name: "Discovery call",
    slug: "discovery-call",
    duration: 30,
    scheduleId: FIXTURE_IDS.schedule,
    enabled: true,
    ...overrides.eventType,
  });
}

interface BookingDeliveryOptions {
  requiresConfirmation?: boolean;
  seedConfirmationWorkflow?: boolean;
}

export interface BookingDeliveryScenario {
  projectId: string;
  eventTypeId: string;
  formId: string;
  startTime: string;
  endTime: string;
  notes: string;
}

export async function seedBookingDeliveryScenario(
  db: DrizzleD1Database<Record<string, unknown>>,
  options: BookingDeliveryOptions = {},
): Promise<BookingDeliveryScenario> {
  const notes =
    "Bring roadmap, budget; and path\\notes.\r\nX-EVIL:injected";
  await db.insert(dbSchema.schema.users).values({
    id: FIXTURE_IDS.owner,
    name: "Aki Owner",
    email: "aki@encited.com",
  });
  await db.insert(dbSchema.projects).values({
    id: FIXTURE_IDS.project,
    userId: FIXTURE_IDS.owner,
    name: "Acme",
    slug: "acme",
    timezone: "America/New_York",
    settings: JSON.stringify({
      theme: {
        primaryBg: "#1B4332",
        primaryText: "#ffffff",
        borderRadius: 16,
      },
    }),
  });
  await db.insert(dbSchema.schedules).values({
    id: FIXTURE_IDS.schedule,
    projectId: FIXTURE_IDS.project,
    name: "New York office hours",
    timezone: "America/New_York",
    isDefault: true,
  });
  await db.insert(dbSchema.availabilityRules).values({
    id: "rule-delivery-monday",
    scheduleId: FIXTURE_IDS.schedule,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "09:30",
  });
  await db.insert(dbSchema.forms).values({
    id: "form-booking-intake",
    projectId: FIXTURE_IDS.project,
    name: "Booking intake",
    slug: "booking-intake",
    type: "single",
    status: "active",
  });
  await db.insert(dbSchema.formSteps).values({
    id: "step-booking-intake",
    formId: "form-booking-intake",
    sortOrder: 0,
    title: "About your company",
  });
  await db.insert(dbSchema.formFields).values([
    {
      id: "company",
      formId: "form-booking-intake",
      stepId: "step-booking-intake",
      sortOrder: 0,
      type: "text",
      label: "Company",
    },
    {
      id: "optional-note",
      formId: "form-booking-intake",
      stepId: "step-booking-intake",
      sortOrder: 1,
      type: "text",
      label: "Optional note",
    },
  ]);
  await db.insert(dbSchema.calendarConnections).values([
    {
      id: FIXTURE_IDS.destinationConnection,
      userId: FIXTURE_IDS.owner,
      provider: "google",
      accessToken: "expired-destination-token",
      refreshToken: "destination-refresh-token",
      email: "calendar-owner@example.com",
    },
    {
      id: FIXTURE_IDS.inviteConnection,
      userId: FIXTURE_IDS.owner,
      provider: "google",
      accessToken: "invite-token",
      refreshToken: "invite-refresh-token",
      email: "observer@example.com",
    },
  ]);
  await db.insert(dbSchema.eventTypes).values({
    id: FIXTURE_IDS.eventType,
    projectId: FIXTURE_IDS.project,
    name: "Discovery call",
    slug: "discovery-call",
    duration: 30,
    location: "Remote studio",
    scheduleId: FIXTURE_IDS.schedule,
    destinationConnectionId: FIXTURE_IDS.destinationConnection,
    destinationCalendarId: "team/calendar@group.calendar.google.com",
    inviteConnectionIds: [
      FIXTURE_IDS.destinationConnection,
      FIXTURE_IDS.inviteConnection,
      FIXTURE_IDS.inviteConnection,
    ].join(","),
    requiresConfirmation: options.requiresConfirmation ?? false,
    bookingFormId: "form-booking-intake",
    enabled: true,
  });

  if (options.seedConfirmationWorkflow) {
    await db.insert(dbSchema.workflows).values({
      id: "workflow-confirmed",
      projectId: FIXTURE_IDS.project,
      name: "Confirmed booking follow-up",
      trigger: "booking_confirmed",
      status: "active",
    });
    await db.insert(dbSchema.workflowSteps).values({
      id: "workflow-confirmed-step",
      workflowId: "workflow-confirmed",
      sortOrder: 0,
      type: "update_contact",
      config: JSON.stringify({
        field: "notes",
        value: "Confirmed booking follow-up queued",
      }),
    });
  }

  return {
    projectId: FIXTURE_IDS.project,
    eventTypeId: FIXTURE_IDS.eventType,
    formId: "form-booking-intake",
    startTime: "2026-03-23T13:00:00.000Z",
    endTime: "2026-03-23T13:30:00.000Z",
    notes,
  };
}

export interface WorkflowFixtureStep {
  id: string;
  sortOrder: number;
  type: dbSchema.NewWorkflowStepRow["type"];
  config?: Record<string, unknown>;
  condition?: Record<string, unknown>;
}

export async function seedWorkflowContactScenario(
  db: DrizzleD1Database<Record<string, unknown>>,
  contactOverrides: Partial<dbSchema.NewContactRow> = {},
): Promise<void> {
  await db.insert(dbSchema.schema.users).values({
    id: WORKFLOW_FIXTURE_IDS.owner,
    name: "Aki Owner",
    email: "aki@encited.com",
  });
  await db.insert(dbSchema.projects).values({
    id: WORKFLOW_FIXTURE_IDS.project,
    userId: WORKFLOW_FIXTURE_IDS.owner,
    name: "Acme",
    slug: "acme",
  });
  await db.insert(dbSchema.contacts).values({
    id: WORKFLOW_FIXTURE_IDS.contact,
    projectId: WORKFLOW_FIXTURE_IDS.project,
    name: "Hanna Guest",
    email: "hanna@northstar.example",
    notes: "Initial note",
    company: "Northstar Oy",
    ...contactOverrides,
  });
  await db.insert(dbSchema.tags).values({
    id: WORKFLOW_FIXTURE_IDS.tag,
    projectId: WORKFLOW_FIXTURE_IDS.project,
    name: "Qualified",
    color: "#1B4332",
  });
}

export async function seedWorkflowDefinition(
  db: DrizzleD1Database<Record<string, unknown>>,
  input: {
    id: string;
    name: string;
    trigger?: dbSchema.NewWorkflowRow["trigger"];
    steps: WorkflowFixtureStep[];
  },
): Promise<void> {
  await db.insert(dbSchema.workflows).values({
    id: input.id,
    projectId: WORKFLOW_FIXTURE_IDS.project,
    name: input.name,
    trigger: input.trigger ?? "booking_created",
    status: "active",
  });
  await db.insert(dbSchema.workflowSteps).values(
    input.steps.map(function toRow(currentStep) {
      return {
        ...currentStep,
        workflowId: input.id,
        config: currentStep.config ?? {},
        condition: currentStep.condition ?? null,
      };
    }),
  );
}
