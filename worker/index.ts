import { Hono } from "hono";
import { cors } from "hono/cors";
import { except } from "hono/combine";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";

import { createAuth } from "./auth";
import * as dbSchema from "./db/schema";
import type { HonoAppContext, Plan, PlanLimits } from "./types";

const { schema } = dbSchema;
import {
  createProjectSchema,
  createEventTypeSchema,
  updateEventTypeSchema,
  createScheduleSchema,
  updateAvailabilityRulesSchema,
  createBookingSchema,
  cancelBookingSchema,
  createFormSchema,
  updateFormSchema,
  createFormStepSchema,
  createFormFieldSchema,
  submitFormStepSchema,
  createContactSchema,
  updateContactSchema,
  createTagSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
  createWorkflowStepSchema,
  createApiKeySchema,
  checkAvailabilitySchema,
  updateEventTypeCalendarsSchema,
  validate,
} from "./validation";

import { getStripe, getPriceId, getPlanFromPriceId } from "./lib/stripe";
import { EventTypeService } from "./services/event-type-service";
import { ScheduleService } from "./services/schedule-service";
import { BookingService } from "./services/booking-service";
import { AvailabilityService } from "./services/availability-service";
import { CalendarService } from "./services/calendar-service";
import { EmailService } from "./services/email-service";
import { FormService } from "./services/form-service";
import { ContactService } from "./services/contact-service";
import { WorkflowService } from "./services/workflow-service";
import { ApiKeyService } from "./services/api-key-service";

// ─── Plan Limits ─────────────────────────────────────────────────────────────

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxProjects: 1,
    maxFormsPerProject: 3,
    maxEventTypes: 3,
    maxContactsPerProject: 100,
    maxWorkflows: 1,
    calendarSync: true,
    maxCalendarConnections: 1,
    apiAccess: false,
    customWidgets: false,
  },
  pro: {
    maxProjects: 5,
    maxFormsPerProject: 20,
    maxEventTypes: 20,
    maxContactsPerProject: 5000,
    maxWorkflows: 10,
    calendarSync: true,
    maxCalendarConnections: -1,
    apiAccess: true,
    customWidgets: false,
  },
  business: {
    maxProjects: 20,
    maxFormsPerProject: -1,
    maxEventTypes: -1,
    maxContactsPerProject: -1,
    maxWorkflows: -1,
    calendarSync: true,
    maxCalendarConnections: -1,
    apiAccess: true,
    customWidgets: true,
  },
};

// ─── Rate Limiter ────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  cleanupRateLimits();
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up stale entries inline during checks (no global setInterval)
function cleanupRateLimits() {
  const now = Date.now();
  if (rateLimitMap.size > 1000) {
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

const app = new Hono<HonoAppContext>();

// ─── Global CORS ─────────────────────────────────────────────────────────────

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

// ─── Auth Routes ─────────────────────────────────────────────────────────────

app.use(
  "/api/auth/*",
  cors({
    origin: (origin) => origin || "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.req.raw.cf as CfProperties);
  return auth.handler(c.req.raw);
});

// ─── Public API Routes ──────────────────────────────────────────────────────

// Check availability for a project's event type
app.get("/api/v1/availability/:slug", async (c) => {
  const slug = c.req.param("slug");
  const date = c.req.query("date");
  const timezone = c.req.query("timezone") ?? "UTC";
  const eventTypeSlug = c.req.query("eventTypeSlug") ?? "";

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (!checkRateLimit(`avail:${ip}`, 60, 60_000)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    validate(checkAvailabilitySchema, { date, timezone, eventTypeSlug });
  } catch {
    return c.json({ error: "Invalid parameters" }, 400);
  }

  try {
    const db = drizzle(c.env.DB, { schema });
    const availabilityService = new AvailabilityService(db);

    // Fetch Google Calendar busy times if configured for this event type
    let externalBusySlots: Array<{ start: string; end: string }> = [];
    try {
      // Look up event type to check for busy calendar config
      const [project] = await db
        .select()
        .from(dbSchema.projects)
        .where(eq(dbSchema.projects.slug, slug))
        .limit(1);

      if (project) {
        const [eventType] = await db
          .select()
          .from(dbSchema.eventTypes)
          .where(
            and(
              eq(dbSchema.eventTypes.projectId, project.id),
              eq(dbSchema.eventTypes.slug, eventTypeSlug),
            ),
          )
          .limit(1);

        if (eventType) {
          const busyCalendars = await db
            .select()
            .from(dbSchema.eventTypeBusyCalendars)
            .where(eq(dbSchema.eventTypeBusyCalendars.eventTypeId, eventType.id));

          if (busyCalendars.length > 0) {
            const calendarService = new CalendarService(db, {
              GOOGLE_CALENDAR_CLIENT_ID: c.env.GOOGLE_CALENDAR_CLIENT_ID,
              GOOGLE_CALENDAR_CLIENT_SECRET: c.env.GOOGLE_CALENDAR_CLIENT_SECRET,
            });

            // Group by connectionId
            const byConnection = new Map<string, string[]>();
            for (const bc of busyCalendars) {
              const existing = byConnection.get(bc.connectionId) ?? [];
              existing.push(bc.calendarId);
              byConnection.set(bc.connectionId, existing);
            }

            const dayStart = `${date}T00:00:00Z`;
            const dayEnd = `${date}T23:59:59Z`;

            for (const [connectionId, calendarIds] of byConnection) {
              try {
                const [conn] = await db
                  .select()
                  .from(dbSchema.calendarConnections)
                  .where(eq(dbSchema.calendarConnections.id, connectionId))
                  .limit(1);

                if (conn) {
                  const accessToken = await calendarService.refreshAccessToken(conn.refreshToken);
                  const busySlots = await calendarService.getFreeBusy(
                    accessToken,
                    calendarIds,
                    dayStart,
                    dayEnd,
                  );
                  externalBusySlots.push(...busySlots);
                }
              } catch (err) {
                console.error(`FreeBusy check failed for connection ${connectionId}:`, err);
                // Don't block availability if calendar check fails
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("FreeBusy lookup failed:", err);
      // Continue without external busy slots
    }

    const slots = await availabilityService.getAvailableSlots({
      projectSlug: slug,
      eventTypeSlug,
      date: date!,
      timezone,
      externalBusySlots,
    });

    return c.json({ slots, date, timezone, projectSlug: slug, eventTypeSlug });
  } catch (err) {
    console.error("Availability error:", err);
    return c.json({ error: "Failed to fetch availability" }, 500);
  }
});

// Create booking (public)
app.post("/api/v1/bookings", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (!checkRateLimit(`booking:${ip}`, 10, 60_000)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    const body = await c.req.json();
    const data = validate(createBookingSchema, body);

    const db = drizzle(c.env.DB, { schema });

    // 1. Look up project by slug
    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, data.projectSlug))
      .limit(1);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // 2. Look up event type by slug within the project
    const [eventType] = await db
      .select()
      .from(dbSchema.eventTypes)
      .where(
        and(
          eq(dbSchema.eventTypes.projectId, project.id),
          eq(dbSchema.eventTypes.slug, data.eventTypeSlug),
        ),
      )
      .limit(1);

    if (!eventType) {
      return c.json({ error: "Event type not found" }, 404);
    }

    if (!eventType.enabled) {
      return c.json({ error: "Event type is not available" }, 400);
    }

    // 3. Parse startTime, calculate endTime from duration
    const startTime = new Date(data.startTime);
    const endTime = new Date(
      startTime.getTime() + eventType.duration * 60 * 1000,
    );

    // 4. Check availability — verify the slot is still open
    const availabilityService = new AvailabilityService(db);
    const dateStr = data.startTime.slice(0, 10); // YYYY-MM-DD
    const slots = await availabilityService.getAvailableSlots({
      projectSlug: data.projectSlug,
      eventTypeSlug: data.eventTypeSlug,
      date: dateStr,
      timezone: data.timezone,
    });

    const slotAvailable = slots.some(
      (slot) => slot.start === startTime.toISOString(),
    );

    if (!slotAvailable) {
      return c.json(
        { error: "Selected time slot is no longer available" },
        409,
      );
    }

    // 5. Determine if booking requires confirmation
    const isPending = eventType.requiresConfirmation;

    // For pending bookings, calculate expiry: min(now + 24h, startTime - 1h)
    let expiresAt: Date | undefined;
    if (isPending) {
      const twentyFourHoursLater = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const oneHourBefore = new Date(startTime.getTime() - 60 * 60 * 1000);

      if (oneHourBefore <= new Date()) {
        return c.json(
          { error: "This event type requires confirmation. Bookings must be made at least 1 hour in advance." },
          400,
        );
      }

      expiresAt = twentyFourHoursLater < oneHourBefore ? twentyFourHoursLater : oneHourBefore;
    }

    // 6. Create the booking
    const bookingService = new BookingService(db);
    const booking = await bookingService.create({
      eventTypeId: eventType.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
      startTime,
      endTime,
      timezone: data.timezone,
      metadata: data.metadata,
      status: isPending ? "pending" : "confirmed",
      expiresAt,
    });

    // 7. Look up project owner for calendar invite + email notification
    const ownerRows = await db
      .select()
      .from(dbSchema.schema.users)
      .where(eq(dbSchema.schema.users.id, project.userId))
      .limit(1);
    const owner = ownerRows[0];

    if (isPending) {
      // 8. Pending booking: send request emails, skip calendar event
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const emailService = new EmailService(c.env.RESEND_API_KEY);

            // Send "request received" email to guest
            await emailService.sendBookingRequestReceived({
              to: data.email,
              guestName: data.name,
              eventTypeName: eventType.name,
              startTime,
              endTime,
              timezone: data.timezone,
            });

            // Send "action needed" email to owner
            if (owner) {
              const dashboardUrl = `${c.env.BETTER_AUTH_URL}/app/projects/${project.id}/bookings?tab=pending`;
              await emailService.sendBookingRequestNotification({
                to: owner.email,
                ownerName: owner.name,
                guestName: data.name,
                guestEmail: data.email,
                eventTypeName: eventType.name,
                startTime,
                endTime,
                dashboardUrl,
              });
            }
          } catch (err) {
            console.error("Pending booking email failed:", err);
          }
        })(),
      );
    } else {
      // 8. Confirmed booking: create calendar event + send confirmation emails
      const calendarService = new CalendarService(db, {
        GOOGLE_CALENDAR_CLIENT_ID: c.env.GOOGLE_CALENDAR_CLIENT_ID,
        GOOGLE_CALENDAR_CLIENT_SECRET: c.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      });

      c.executionCtx.waitUntil(
        (async () => {
          try {
            let calConnection;
            let destinationCalendarId = "primary";

            if (eventType.destinationConnectionId) {
              const [conn] = await db
                .select()
                .from(dbSchema.calendarConnections)
                .where(eq(dbSchema.calendarConnections.id, eventType.destinationConnectionId))
                .limit(1);
              calConnection = conn;
              if (eventType.destinationCalendarId) {
                destinationCalendarId = eventType.destinationCalendarId;
              }
            } else {
              const [conn] = await db
                .select()
                .from(dbSchema.calendarConnections)
                .where(eq(dbSchema.calendarConnections.userId, project.userId))
                .limit(1);
              calConnection = conn;
            }

            if (calConnection) {
              const accessToken = await calendarService.refreshAccessToken(
                calConnection.refreshToken,
              );

              const gcalEventId = await calendarService.createEvent(
                accessToken,
                destinationCalendarId,
                {
                  summary: `${eventType.name} with ${data.name}`,
                  start: startTime.toISOString(),
                  end: endTime.toISOString(),
                  description: data.notes,
                  attendees: [data.email],
                  organizerEmail: owner?.email,
                  organizerName: owner?.name,
                  guestName: data.name,
                },
              );

              await db
                .update(dbSchema.bookings)
                .set({ gcalEventId })
                .where(eq(dbSchema.bookings.id, booking.id));
            }
          } catch (err) {
            console.error("Google Calendar event creation failed:", err);
          }
        })(),
      );

      c.executionCtx.waitUntil(
        (async () => {
          try {
            const emailService = new EmailService(c.env.RESEND_API_KEY);

            await emailService.sendBookingConfirmation({
              to: data.email,
              guestName: data.name,
              eventTypeName: eventType.name,
              startTime,
              endTime,
              timezone: data.timezone,
              location: eventType.location ?? undefined,
              notes: data.notes,
            });

            if (owner) {
              await emailService.sendBookingNotification({
                to: owner.email,
                ownerName: owner.name,
                guestName: data.name,
                guestEmail: data.email,
                eventTypeName: eventType.name,
                startTime,
                endTime,
              });
            }
          } catch (err) {
            console.error("Email sending failed:", err);
          }
        })(),
      );
    }

    return c.json({ booking }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Booking creation error:", err);
    return c.json({ error: "Failed to create booking" }, 500);
  }
});

// Start form response (public)
app.post("/api/v1/forms/:slug/responses", async (c) => {
  const slug = c.req.param("slug");
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (!checkRateLimit(`form:${ip}`, 30, 60_000)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    const db = drizzle(c.env.DB, { schema });
    const service = new FormService(db);

    // Find the form by slug (need projectSlug from query or body)
    const projectSlug = c.req.query("projectSlug") ?? "";
    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, projectSlug))
      .limit(1);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const form = await service.getBySlug(project.id, slug);
    if (!form || form.status !== "active") {
      return c.json({ error: "Form not found or inactive" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const response = await service.createResponse(form.id, body.metadata);
    const fullForm = await service.getFullForm(form.id);

    return c.json({ response, form: fullForm }, 201);
  } catch (err) {
    console.error("Form response creation error:", err);
    return c.json({ error: "Failed to start form response" }, 500);
  }
});

// Submit form step (public)
app.patch(
  "/api/v1/forms/:slug/responses/:responseId/steps/:stepIndex",
  async (c) => {
    const responseId = c.req.param("responseId");
    const stepIndex = parseInt(c.req.param("stepIndex"), 10);

    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    if (!checkRateLimit(`formstep:${ip}`, 60, 60_000)) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    try {
      const body = await c.req.json();
      const data = validate(submitFormStepSchema, body);

      const db = drizzle(c.env.DB, { schema });
      const service = new FormService(db);

      const response = await service.submitStep(
        responseId,
        stepIndex,
        data.fields,
      );

      if (!response) {
        return c.json({ error: "Response not found" }, 404);
      }

      return c.json({ response });
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        return c.json({ error: "Invalid request" }, 400);
      }
      console.error("Form step submission error:", err);
      return c.json({ error: "Failed to submit form step" }, 500);
    }
  },
);

// Widget config (booking)
app.get("/api/widget/booking/:projectSlug/config", async (c) => {
  try {
    const projectSlug = c.req.param("projectSlug");
    const db = drizzle(c.env.DB, { schema });

    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, projectSlug))
      .limit(1);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const service = new EventTypeService(db);
    const eventTypes = await service.list(project.id);
    const activeEventTypes = eventTypes.filter((et) => et.enabled);

    const settings = project.settings
      ? JSON.parse(project.settings as string)
      : {};
    return c.json({
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        settings,
      },
      eventTypes: activeEventTypes,
    });
  } catch (err) {
    console.error("Booking widget config error:", err);
    return c.json({ error: "Failed to load booking config" }, 500);
  }
});

// Public event type detail (for booking page)
app.get("/api/v1/event-types/:projectSlug/:eventSlug", async (c) => {
  try {
    const projectSlug = c.req.param("projectSlug");
    const eventSlug = c.req.param("eventSlug");
    const db = drizzle(c.env.DB, { schema });

    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, projectSlug))
      .limit(1);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const service = new EventTypeService(db);
    const eventType = await service.getBySlug(project.id, eventSlug);

    if (!eventType || !eventType.enabled) {
      return c.json({ error: "Event type not found" }, 404);
    }

    const settings = project.settings
      ? JSON.parse(project.settings as string)
      : {};
    return c.json({
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        settings,
      },
      eventType,
    });
  } catch (err) {
    console.error("Event type detail error:", err);
    return c.json({ error: "Failed to load event type" }, 500);
  }
});

// Widget config (form)
app.get("/api/widget/form/:projectSlug/:formSlug/config", async (c) => {
  try {
    const projectSlug = c.req.param("projectSlug");
    const formSlug = c.req.param("formSlug");

    const db = drizzle(c.env.DB, { schema });
    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, projectSlug))
      .limit(1);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const service = new FormService(db);
    const form = await service.getFullFormBySlug(project.id, formSlug);

    if (!form || form.status !== "active") {
      return c.json({ error: "Form not found or inactive" }, 404);
    }

    return c.json({ form, projectSlug });
  } catch (err) {
    console.error("Form widget config error:", err);
    return c.json({ error: "Failed to load form config" }, 500);
  }
});

// ─── Public Form Routes (shareable links) ────────────────────────────────────

app.get("/api/public/forms/:slug", async (c) => {
  try {
    const slug = c.req.param("slug");
    const db = drizzle(c.env.DB, { schema });
    const service = new FormService(db);
    const form = await service.getFullFormBySlugGlobal(slug);

    if (!form || form.status !== "active") {
      return c.json({ error: "Form not found" }, 404);
    }

    // Fetch project settings for theming
    const [project] = await db
      .select({
        id: dbSchema.projects.id,
        name: dbSchema.projects.name,
        slug: dbSchema.projects.slug,
        settings: dbSchema.projects.settings,
      })
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, form.projectId))
      .limit(1);

    const projectInfo = project
      ? {
          id: project.id,
          name: project.name,
          slug: project.slug,
          settings: project.settings
            ? JSON.parse(project.settings as string)
            : {},
        }
      : null;

    return c.json({ form, project: projectInfo });
  } catch (err) {
    console.error("Public form fetch error:", err);
    return c.json({ error: "Failed to load form" }, 500);
  }
});

app.post("/api/public/forms/:slug/responses", async (c) => {
  const slug = c.req.param("slug");
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (!checkRateLimit(`form:${ip}`, 30, 60_000)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    const db = drizzle(c.env.DB, { schema });
    const service = new FormService(db);
    const form = await service.getBySlugGlobal(slug);

    if (!form || form.status !== "active") {
      return c.json({ error: "Form not found or inactive" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const response = await service.createResponse(form.id, body.metadata);

    return c.json({ response }, 201);
  } catch (err) {
    console.error("Public form response creation error:", err);
    return c.json({ error: "Failed to start form response" }, 500);
  }
});

app.patch(
  "/api/public/forms/:slug/responses/:responseId/steps/:stepIndex",
  async (c) => {
    const responseId = c.req.param("responseId");
    const stepIndex = parseInt(c.req.param("stepIndex"), 10);

    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    if (!checkRateLimit(`formstep:${ip}`, 60, 60_000)) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    try {
      const body = await c.req.json();
      const data = validate(submitFormStepSchema, body);

      const db = drizzle(c.env.DB, { schema });
      const service = new FormService(db);

      const response = await service.submitStep(
        responseId,
        stepIndex,
        data.fields,
      );

      if (!response) {
        return c.json({ error: "Response not found" }, 404);
      }

      return c.json({ response });
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        return c.json({ error: "Invalid request" }, 400);
      }
      console.error("Public form step submission error:", err);
      return c.json({ error: "Failed to submit form step" }, 500);
    }
  },
);

// ─── Stripe Helpers ──────────────────────────────────────────────────────────

import type Stripe from "stripe";
import type { AppEnv } from "./types";

async function syncSubscription(
  stripe: Stripe,
  db: ReturnType<typeof drizzle>,
  env: AppEnv,
  subscriptionId: string,
  customerId: string,
) {
  // Find user by stripeCustomerId
  const [existingSub] = await db
    .select()
    .from(dbSchema.subscriptions)
    .where(eq(dbSchema.subscriptions.stripeCustomerId, customerId))
    .limit(1);

  if (!existingSub) {
    console.error(`No subscription record found for customer ${customerId}`);
    return;
  }

  const stripeSubscription =
    await stripe.subscriptions.retrieve(subscriptionId);
  const firstItem = stripeSubscription.items.data[0];
  const priceId = firstItem?.price?.id;

  let plan: "free" | "pro" | "business" = "free";
  let interval: "monthly" | "annual" = "monthly";

  if (priceId) {
    const lookup = getPlanFromPriceId(env, priceId);
    if (lookup) {
      plan = lookup.plan;
      interval = lookup.interval === "year" ? "annual" : "monthly";
    }
  }

  // If subscription is canceled/unpaid, revert to free
  const terminalStatuses = ["canceled", "unpaid"];
  if (terminalStatuses.includes(stripeSubscription.status)) {
    plan = "free";
  }

  await db
    .update(dbSchema.subscriptions)
    .set({
      stripeSubscriptionId: subscriptionId,
      plan,
      interval,
      status: stripeSubscription.status as
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "trialing",
      currentPeriodStart: firstItem
        ? new Date(firstItem.current_period_start * 1000)
        : null,
      currentPeriodEnd: firstItem
        ? new Date(firstItem.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    })
    .where(eq(dbSchema.subscriptions.id, existingSub.id));
}

// ─── Stripe Webhook ──────────────────────────────────────────────────────────

app.post("/api/billing/webhook", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing signature" }, 400);
  }

  const stripe = getStripe(c.env);
  const rawBody = await c.req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  const db = drizzle(c.env.DB, { schema });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;
          if (customerId) {
            await syncSubscription(
              stripe,
              db,
              c.env,
              subscriptionId,
              customerId,
            );
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        await syncSubscription(stripe, db, c.env, subscription.id, customerId);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    return c.json({ error: "Webhook handler failed" }, 500);
  }

  return c.json({ received: true });
});

// ─── Session Middleware ──────────────────────────────────────────────────────

app.use("/api/*", async (c, next) => {
  // Skip auth for public routes and auth routes
  const path = c.req.path;
  if (
    path.startsWith("/api/v1/") ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/widget/") ||
    path.startsWith("/api/public/") ||
    path.startsWith("/api/uploads/") ||
    path === "/api/billing/webhook"
  ) {
    return next();
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user || !session?.session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = drizzle(c.env.DB, { schema });

  // Load subscription
  const [sub] = await db
    .select()
    .from(dbSchema.subscriptions)
    .where(eq(dbSchema.subscriptions.userId, session.user.id))
    .limit(1);

  const plan: Plan = (sub?.plan as Plan) ?? "free";
  const status = sub?.status ?? "active";

  c.set("user", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  });
  c.set("session", {
    id: session.session.id,
    userId: session.session.userId,
    token: session.session.token,
    expiresAt: session.session.expiresAt,
  });
  c.set("db", db);
  c.set("subscription", { plan, status });
  c.set("planLimits", PLAN_LIMITS[plan]);
  c.set("effectiveUserId", session.user.id);

  return next();
});

// ─── Projects ────────────────────────────────────────────────────────────────

app.get("/api/projects", async (c) => {
  const db = c.get("db");
  const userId = c.get("effectiveUserId");

  const rows = await db
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.userId, userId));

  return c.json({ projects: rows });
});

app.post("/api/projects", async (c) => {
  try {
    const body = await c.req.json();
    const data = validate(createProjectSchema, body);

    const db = c.get("db");
    const userId = c.get("effectiveUserId");
    const planLimits = c.get("planLimits");

    // Check plan limits
    const existingProjects = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.userId, userId));

    if (
      planLimits.maxProjects !== -1 &&
      existingProjects.length >= planLimits.maxProjects
    ) {
      return c.json(
        {
          error: `Plan limit reached: maximum ${planLimits.maxProjects} project(s)`,
        },
        403,
      );
    }

    // Check for slug uniqueness
    const [existingSlug] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, data.slug))
      .limit(1);

    if (existingSlug) {
      return c.json({ error: "Slug is already taken" }, 409);
    }

    const id = crypto.randomUUID();
    await db.insert(dbSchema.projects).values({
      id,
      userId,
      name: data.name,
      slug: data.slug,
      timezone: data.timezone,
    });

    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, id))
      .limit(1);

    return c.json({ project }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Project creation error:", err);
    return c.json({ error: "Failed to create project" }, 500);
  }
});

// Get single project
app.get("/api/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const db = c.get("db");

  const [project] = await db
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const parsed = {
    ...project,
    settings: project.settings ? JSON.parse(project.settings as string) : {},
  };
  return c.json({ project: parsed });
});

// Update project
app.put("/api/projects/:projectId", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const db = c.get("db");

    const values: Record<string, unknown> = {};
    if (body.name !== undefined) values.name = body.name;
    if (body.slug !== undefined) values.slug = body.slug;
    if (body.timezone !== undefined) values.timezone = body.timezone;
    if (body.settings !== undefined)
      values.settings = JSON.stringify(body.settings);

    if (Object.keys(values).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    await db
      .update(dbSchema.projects)
      .set(values)
      .where(eq(dbSchema.projects.id, projectId));

    const [updated] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, projectId))
      .limit(1);

    const parsed = {
      ...updated,
      settings: updated.settings ? JSON.parse(updated.settings as string) : {},
    };
    return c.json({ project: parsed });
  } catch (err) {
    console.error("Project update error:", err);
    return c.json({ error: "Failed to update project" }, 500);
  }
});

// ─── Uploads (R2) ────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

app.post("/api/projects/:projectId/uploads", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return c.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" },
        400,
      );
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return c.json({ error: "File too large. Maximum 5MB" }, 400);
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const key = `projects/${projectId}/${crypto.randomUUID()}.${ext}`;

    await c.env.UPLOADS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    return c.json({ key, url: `/api/uploads/${key}` }, 201);
  } catch (err) {
    console.error("Upload error:", err);
    return c.json({ error: "Failed to upload file" }, 500);
  }
});

app.delete("/api/projects/:projectId/uploads/:key{.+}", async (c) => {
  try {
    const key = c.req.param("key");
    await c.env.UPLOADS.delete(key);
    return c.json({ success: true });
  } catch (err) {
    console.error("Delete upload error:", err);
    return c.json({ error: "Failed to delete file" }, 500);
  }
});

// Serve uploaded files (public, no auth needed — handled outside auth middleware)
app.get("/api/uploads/:key{.+}", async (c) => {
  try {
    const key = c.req.param("key");
    const object = await c.env.UPLOADS.get(key);

    if (!object) {
      return c.json({ error: "Not found" }, 404);
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType ?? "application/octet-stream",
    );
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  } catch (err) {
    console.error("Serve upload error:", err);
    return c.json({ error: "Failed to serve file" }, 500);
  }
});

// ─── Event Types ─────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/event-types", async (c) => {
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const service = new EventTypeService(db);
  const eventTypes = await service.list(projectId);
  return c.json({ eventTypes });
});

app.get("/api/projects/:projectId/event-types/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const service = new EventTypeService(db);
  const result = await service.getByIdWithSchedule(id);
  if (!result) {
    return c.json({ error: "Event type not found" }, 404);
  }
  return c.json(result);
});

app.post("/api/projects/:projectId/event-types", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const data = validate(createEventTypeSchema, body);

    const db = c.get("db");
    const planLimits = c.get("planLimits");

    // Check plan limits for event types
    const service = new EventTypeService(db);
    const existing = await service.list(projectId);

    if (
      planLimits.maxEventTypes !== -1 &&
      existing.length >= planLimits.maxEventTypes
    ) {
      return c.json(
        {
          error: `Plan limit reached: maximum ${planLimits.maxEventTypes} event type(s)`,
        },
        403,
      );
    }

    const eventType = await service.create(projectId, {
      name: data.name,
      slug: data.slug,
      duration: data.duration,
      description: data.description ?? undefined,
      location: data.location ?? undefined,
      color: data.color ?? undefined,
      bufferBefore: data.bufferBefore,
      bufferAfter: data.bufferAfter,
      maxPerDay: data.maxPerDay ?? undefined,
      enabled: data.enabled,
      settings: data.settings ?? undefined,
      copyFromEventTypeId: data.copyFromEventTypeId ?? undefined,
    });
    return c.json({ eventType }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Event type creation error:", err);
    return c.json({ error: "Failed to create event type" }, 500);
  }
});

app.put("/api/projects/:projectId/event-types/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(updateEventTypeSchema, body);

    const db = c.get("db");
    const service = new EventTypeService(db);
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.description !== undefined)
      updateData.description = data.description ?? undefined;
    if (data.location !== undefined)
      updateData.location = data.location ?? undefined;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.bufferBefore !== undefined)
      updateData.bufferBefore = data.bufferBefore;
    if (data.bufferAfter !== undefined)
      updateData.bufferAfter = data.bufferAfter;
    if (data.maxPerDay !== undefined)
      updateData.maxPerDay = data.maxPerDay ?? undefined;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.settings !== undefined)
      updateData.settings = data.settings ?? undefined;

    const eventType = await service.update(
      id,
      updateData as Parameters<typeof service.update>[1],
    );

    if (!eventType) {
      return c.json({ error: "Event type not found" }, 404);
    }

    return c.json({ eventType });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Event type update error:", err);
    return c.json({ error: "Failed to update event type" }, 500);
  }
});

app.delete("/api/projects/:projectId/event-types/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new EventTypeService(db);

    const existing = await service.getById(id);
    if (!existing) {
      return c.json({ error: "Event type not found" }, 404);
    }

    await service.delete(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Event type deletion error:", err);
    return c.json({ error: "Failed to delete event type" }, 500);
  }
});

// ─── Schedules ───────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/schedules", async (c) => {
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const service = new ScheduleService(db);
  const schedules = await service.list(projectId);
  return c.json({ schedules });
});

app.post("/api/projects/:projectId/schedules", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const data = validate(createScheduleSchema, body);

    const db = c.get("db");
    const service = new ScheduleService(db);
    const schedule = await service.create(projectId, data);

    return c.json({ schedule }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Schedule creation error:", err);
    return c.json({ error: "Failed to create schedule" }, 500);
  }
});

app.put("/api/projects/:projectId/schedules/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(createScheduleSchema, body);

    const db = c.get("db");
    const service = new ScheduleService(db);
    const schedule = await service.update(id, data);

    if (!schedule) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    return c.json({ schedule });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Schedule update error:", err);
    return c.json({ error: "Failed to update schedule" }, 500);
  }
});

app.delete("/api/projects/:projectId/schedules/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new ScheduleService(db);
    await service.delete(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Schedule deletion error:", err);
    return c.json({ error: "Failed to delete schedule" }, 500);
  }
});

app.put("/api/projects/:projectId/schedules/:id/rules", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(updateAvailabilityRulesSchema, body);

    const db = c.get("db");
    const service = new ScheduleService(db);

    // Also update timezone if provided
    if (body.timezone) {
      await service.update(id, { timezone: body.timezone });
    }

    const rules = await service.setRules(id, data.rules);

    return c.json({ rules });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Schedule rules update error:", err);
    return c.json({ error: "Failed to update schedule rules" }, 500);
  }
});

app.get("/api/projects/:projectId/schedules/:id/rules", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new ScheduleService(db);
    const rules = await service.getRules(id);
    return c.json({ rules });
  } catch (err) {
    console.error("Schedule rules fetch error:", err);
    return c.json({ error: "Failed to fetch schedule rules" }, 500);
  }
});

app.get("/api/projects/:projectId/schedules/:id/overrides", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new ScheduleService(db);
    const overrides = await service.getOverrides(id);
    return c.json({ overrides });
  } catch (err) {
    console.error("Schedule overrides fetch error:", err);
    return c.json({ error: "Failed to fetch schedule overrides" }, 500);
  }
});

app.post("/api/projects/:projectId/schedules/:id/overrides", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const db = c.get("db");
    const service = new ScheduleService(db);
    const override = await service.addOverride(id, body);
    return c.json({ override }, 201);
  } catch (err) {
    console.error("Schedule override creation error:", err);
    return c.json({ error: "Failed to add override" }, 500);
  }
});

app.delete(
  "/api/projects/:projectId/schedules/:id/overrides/:overrideId",
  async (c) => {
    try {
      const overrideId = c.req.param("overrideId");
      const db = c.get("db");
      const service = new ScheduleService(db);
      await service.deleteOverride(overrideId);
      return c.json({ success: true });
    } catch (err) {
      console.error("Schedule override deletion error:", err);
      return c.json({ error: "Failed to delete override" }, 500);
    }
  },
);

// ─── Bookings ────────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/bookings", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const db = c.get("db");
    const service = new BookingService(db);
    const bookings = await service.listByProject(projectId);
    return c.json({ bookings });
  } catch (err) {
    console.error("Bookings list error:", err);
    return c.json({ error: "Failed to fetch bookings" }, 500);
  }
});

app.patch("/api/projects/:projectId/bookings/:id/cancel", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(cancelBookingSchema, body);

    const db = c.get("db");
    const bookingService = new BookingService(db);
    const booking = await bookingService.cancel(id, data.reason);

    if (!booking) {
      return c.json({ error: "Booking not found" }, 404);
    }

    // If the booking had a Google Calendar event, try to delete it in the background
    if (booking.gcalEventId) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            // Look up the project owner via event type
            const [eventType] = await db
              .select()
              .from(dbSchema.eventTypes)
              .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
              .limit(1);

            if (!eventType) return;

            const [project] = await db
              .select()
              .from(dbSchema.projects)
              .where(eq(dbSchema.projects.id, eventType.projectId))
              .limit(1);

            if (!project) return;

            // Use per-event-type destination calendar if set, else fall back
            let calConnection;
            let destinationCalendarId = "primary";

            if (eventType.destinationConnectionId) {
              const [conn] = await db
                .select()
                .from(dbSchema.calendarConnections)
                .where(eq(dbSchema.calendarConnections.id, eventType.destinationConnectionId))
                .limit(1);
              calConnection = conn;
              if (eventType.destinationCalendarId) {
                destinationCalendarId = eventType.destinationCalendarId;
              }
            } else {
              const [conn] = await db
                .select()
                .from(dbSchema.calendarConnections)
                .where(eq(dbSchema.calendarConnections.userId, project.userId))
                .limit(1);
              calConnection = conn;
            }

            if (!calConnection) return;

            const calendarService = new CalendarService(db, {
              GOOGLE_CALENDAR_CLIENT_ID: c.env.GOOGLE_CALENDAR_CLIENT_ID,
              GOOGLE_CALENDAR_CLIENT_SECRET:
                c.env.GOOGLE_CALENDAR_CLIENT_SECRET,
            });

            const accessToken = await calendarService.refreshAccessToken(
              calConnection.refreshToken,
            );

            await calendarService.deleteEvent(
              accessToken,
              destinationCalendarId,
              booking.gcalEventId!,
            );
          } catch (err) {
            console.error("Google Calendar event deletion failed:", err);
          }
        })(),
      );
    }

    // Send cancellation email in background
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const emailService = new EmailService(c.env.RESEND_API_KEY);
          await emailService.sendBookingCancellation({
            to: booking.email,
            guestName: booking.name,
            eventTypeName: booking.eventTypeId, // fallback
            startTime: new Date(booking.startTime),
            endTime: new Date(booking.endTime),
            reason: data.reason,
          });
        } catch (err) {
          console.error("Cancellation email failed:", err);
        }
      })(),
    );

    return c.json({ booking });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Booking cancellation error:", err);
    return c.json({ error: "Failed to cancel booking" }, 500);
  }
});

// ─── Confirm Booking ─────────────────────────────────────────────────────────

app.patch("/api/projects/:projectId/bookings/:id/confirm", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");

    const bookingService = new BookingService(db);
    const booking = await bookingService.confirm(id);

    if (!booking) {
      return c.json({ error: "Booking not found or not pending" }, 404);
    }

    // Check if the event time has already passed
    if (new Date(booking.startTime) <= new Date()) {
      return c.json({ error: "Cannot confirm a booking whose time has already passed" }, 400);
    }

    // Look up event type and project for calendar + email
    const [eventType] = await db
      .select()
      .from(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
      .limit(1);

    if (!eventType) {
      return c.json({ booking });
    }

    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, eventType.projectId))
      .limit(1);

    const ownerRows = await db
      .select()
      .from(dbSchema.schema.users)
      .where(eq(dbSchema.schema.users.id, project.userId))
      .limit(1);
    const owner = ownerRows[0];

    // Create Google Calendar event now
    const calendarService = new CalendarService(db, {
      GOOGLE_CALENDAR_CLIENT_ID: c.env.GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: c.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    });

    c.executionCtx.waitUntil(
      (async () => {
        try {
          let calConnection;
          let destinationCalendarId = "primary";

          if (eventType.destinationConnectionId) {
            const [conn] = await db
              .select()
              .from(dbSchema.calendarConnections)
              .where(eq(dbSchema.calendarConnections.id, eventType.destinationConnectionId))
              .limit(1);
            calConnection = conn;
            if (eventType.destinationCalendarId) {
              destinationCalendarId = eventType.destinationCalendarId;
            }
          } else {
            const [conn] = await db
              .select()
              .from(dbSchema.calendarConnections)
              .where(eq(dbSchema.calendarConnections.userId, project.userId))
              .limit(1);
            calConnection = conn;
          }

          if (calConnection) {
            const accessToken = await calendarService.refreshAccessToken(
              calConnection.refreshToken,
            );

            const gcalEventId = await calendarService.createEvent(
              accessToken,
              destinationCalendarId,
              {
                summary: `${eventType.name} with ${booking.name}`,
                start: new Date(booking.startTime).toISOString(),
                end: new Date(booking.endTime).toISOString(),
                description: booking.notes ?? undefined,
                attendees: [booking.email],
                organizerEmail: owner?.email,
                organizerName: owner?.name,
                guestName: booking.name,
              },
            );

            await db
              .update(dbSchema.bookings)
              .set({ gcalEventId })
              .where(eq(dbSchema.bookings.id, booking.id));
          }
        } catch (err) {
          console.error("Calendar event creation on confirm failed:", err);
        }
      })(),
    );

    // Send confirmation email to guest
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const emailService = new EmailService(c.env.RESEND_API_KEY);

          await emailService.sendBookingConfirmation({
            to: booking.email,
            guestName: booking.name,
            eventTypeName: eventType.name,
            startTime: new Date(booking.startTime),
            endTime: new Date(booking.endTime),
            timezone: booking.timezone,
            location: eventType.location ?? undefined,
            notes: booking.notes ?? undefined,
          });
        } catch (err) {
          console.error("Confirmation email failed:", err);
        }
      })(),
    );

    return c.json({ booking });
  } catch (err) {
    console.error("Booking confirm error:", err);
    return c.json({ error: "Failed to confirm booking" }, 500);
  }
});

// ─── Decline Booking ─────────────────────────────────────────────────────────

app.patch("/api/projects/:projectId/bookings/:id/decline", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");

    const bookingService = new BookingService(db);
    const booking = await bookingService.decline(id);

    if (!booking) {
      return c.json({ error: "Booking not found or not pending" }, 404);
    }

    // Look up event type for email
    const [eventType] = await db
      .select()
      .from(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
      .limit(1);

    // Send decline email to guest
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const emailService = new EmailService(c.env.RESEND_API_KEY);
          await emailService.sendBookingDeclined({
            to: booking.email,
            guestName: booking.name,
            eventTypeName: eventType?.name ?? "Meeting",
            startTime: new Date(booking.startTime),
            endTime: new Date(booking.endTime),
            timezone: booking.timezone,
          });
        } catch (err) {
          console.error("Decline email failed:", err);
        }
      })(),
    );

    return c.json({ booking });
  } catch (err) {
    console.error("Booking decline error:", err);
    return c.json({ error: "Failed to decline booking" }, 500);
  }
});

// ─── Forms ───────────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/forms", async (c) => {
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const service = new FormService(db);
  const forms = await service.list(projectId);
  return c.json({ forms });
});

app.get("/api/projects/:projectId/forms/:formId", async (c) => {
  const formId = c.req.param("formId");
  const db = c.get("db");
  const service = new FormService(db);
  const form = await service.getFullForm(formId);
  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }
  return c.json({ form });
});

app.post("/api/projects/:projectId/forms", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const data = validate(createFormSchema, body);

    const db = c.get("db");
    const planLimits = c.get("planLimits");
    const service = new FormService(db);

    // Check plan limits
    const existing = await service.list(projectId);
    if (
      planLimits.maxFormsPerProject !== -1 &&
      existing.length >= planLimits.maxFormsPerProject
    ) {
      return c.json(
        {
          error: `Plan limit reached: maximum ${planLimits.maxFormsPerProject} form(s)`,
        },
        403,
      );
    }

    // Check slug uniqueness globally (slugs must be unique for shareable links)
    const existingSlug = await service.getBySlugGlobal(data.slug);
    if (existingSlug) {
      return c.json(
        {
          error:
            "This form slug is already taken. Please choose a different one.",
        },
        409,
      );
    }

    const form = await service.create(projectId, data);
    return c.json({ form }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Form creation error:", err);
    return c.json({ error: "Failed to create form" }, 500);
  }
});

app.put("/api/projects/:projectId/forms/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(updateFormSchema, body);

    const db = c.get("db");
    const service = new FormService(db);

    // Check slug uniqueness globally if slug is being changed
    if (data.slug) {
      const existing = await service.getBySlugGlobal(data.slug);
      if (existing && existing.id !== id) {
        return c.json(
          {
            error:
              "This form slug is already taken. Please choose a different one.",
          },
          409,
        );
      }
    }

    const form = await service.update(id, data);

    if (!form) {
      return c.json({ error: "Form not found" }, 404);
    }

    return c.json({ form });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Form update error:", err);
    return c.json({ error: "Failed to update form" }, 500);
  }
});

app.delete("/api/projects/:projectId/forms/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new FormService(db);
    await service.delete(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Form deletion error:", err);
    return c.json({ error: "Failed to delete form" }, 500);
  }
});

// ─── Form Steps ──────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/forms/:formId/steps", async (c) => {
  const formId = c.req.param("formId");
  const db = c.get("db");
  const service = new FormService(db);
  const steps = await service.listSteps(formId);
  return c.json({ steps });
});

app.post("/api/projects/:projectId/forms/:formId/steps", async (c) => {
  try {
    const formId = c.req.param("formId");
    const body = await c.req.json();
    const data = validate(createFormStepSchema, body);

    const db = c.get("db");
    const service = new FormService(db);
    const step = await service.createStep(formId, data);

    return c.json({ step }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Form step creation error:", err);
    return c.json({ error: "Failed to create form step" }, 500);
  }
});

app.put("/api/projects/:projectId/forms/:formId/steps/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const db = c.get("db");
    const service = new FormService(db);
    const step = await service.updateStep(id, body);

    if (!step) {
      return c.json({ error: "Step not found" }, 404);
    }

    return c.json({ step });
  } catch (err) {
    console.error("Form step update error:", err);
    return c.json({ error: "Failed to update form step" }, 500);
  }
});

app.delete("/api/projects/:projectId/forms/:formId/steps/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new FormService(db);
    await service.deleteStep(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Form step deletion error:", err);
    return c.json({ error: "Failed to delete form step" }, 500);
  }
});

app.put("/api/projects/:projectId/forms/:formId/steps/reorder", async (c) => {
  try {
    const formId = c.req.param("formId");
    const body = await c.req.json();
    const { stepIds } = body as { stepIds: string[] };

    const db = c.get("db");
    const service = new FormService(db);
    const steps = await service.reorderSteps(formId, stepIds);

    return c.json({ steps });
  } catch (err) {
    console.error("Form step reorder error:", err);
    return c.json({ error: "Failed to reorder steps" }, 500);
  }
});

// ─── Form Fields ─────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/forms/:formId/fields", async (c) => {
  const formId = c.req.param("formId");
  const db = c.get("db");
  const service = new FormService(db);
  const fields = await service.listFields(formId);
  return c.json({ fields });
});

app.post("/api/projects/:projectId/forms/:formId/fields", async (c) => {
  try {
    const body = await c.req.json();
    const data = validate(createFormFieldSchema, body);

    const db = c.get("db");
    const service = new FormService(db);
    const field = await service.createField(data);

    return c.json({ field }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Form field creation error:", err);
    return c.json({ error: "Failed to create form field" }, 500);
  }
});

app.put("/api/projects/:projectId/forms/:formId/fields/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const db = c.get("db");
    const service = new FormService(db);
    const field = await service.updateField(id, body);

    if (!field) {
      return c.json({ error: "Field not found" }, 404);
    }

    return c.json({ field });
  } catch (err) {
    console.error("Form field update error:", err);
    return c.json({ error: "Failed to update form field" }, 500);
  }
});

app.delete("/api/projects/:projectId/forms/:formId/fields/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new FormService(db);
    await service.deleteField(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Form field deletion error:", err);
    return c.json({ error: "Failed to delete form field" }, 500);
  }
});

// ─── Form Responses ──────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/forms/:formId/responses", async (c) => {
  const formId = c.req.param("formId");
  const db = c.get("db");
  const service = new FormService(db);
  const responses = await service.listResponsesWithValues(formId);
  return c.json({ responses });
});

app.get(
  "/api/projects/:projectId/forms/:formId/responses/:responseId",
  async (c) => {
    const responseId = c.req.param("responseId");
    const db = c.get("db");
    const service = new FormService(db);
    const response = await service.getResponseWithValues(responseId);
    if (!response) {
      return c.json({ error: "Response not found" }, 404);
    }
    return c.json({ response });
  },
);

// ─── Contacts ────────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/contacts", async (c) => {
  const projectId = c.req.param("projectId");
  const search = c.req.query("search");
  const tagId = c.req.query("tagId");
  const db = c.get("db");
  const service = new ContactService(db);
  const contacts = await service.listWithTags(projectId, { search, tagId });
  return c.json({ contacts });
});

app.post("/api/projects/:projectId/contacts", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const data = validate(createContactSchema, body);

    const db = c.get("db");
    const planLimits = c.get("planLimits");
    const service = new ContactService(db);

    // Check plan limits
    const existing = await service.list(projectId);
    if (
      planLimits.maxContactsPerProject !== -1 &&
      existing.length >= planLimits.maxContactsPerProject
    ) {
      return c.json(
        {
          error: `Plan limit reached: maximum ${planLimits.maxContactsPerProject} contacts`,
        },
        403,
      );
    }

    const contact = await service.create(projectId, data);
    return c.json({ contact }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Contact creation error:", err);
    return c.json({ error: "Failed to create contact" }, 500);
  }
});

app.get("/api/projects/:projectId/contacts/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const service = new ContactService(db);
  const contact = await service.getWithDetails(id);
  if (!contact) {
    return c.json({ error: "Contact not found" }, 404);
  }
  return c.json({ contact });
});

app.put("/api/projects/:projectId/contacts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(updateContactSchema, body);

    const db = c.get("db");
    const service = new ContactService(db);
    const contact = await service.update(id, data);

    if (!contact) {
      return c.json({ error: "Contact not found" }, 404);
    }

    return c.json({ contact });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Contact update error:", err);
    return c.json({ error: "Failed to update contact" }, 500);
  }
});

app.delete("/api/projects/:projectId/contacts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new ContactService(db);
    await service.delete(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Contact deletion error:", err);
    return c.json({ error: "Failed to delete contact" }, 500);
  }
});

// ─── Tags ────────────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/tags", async (c) => {
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const service = new ContactService(db);
  const tags = await service.listTags(projectId);
  return c.json({ tags });
});

app.post("/api/projects/:projectId/tags", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const data = validate(createTagSchema, body);

    const db = c.get("db");
    const service = new ContactService(db);
    const tag = await service.createTag(projectId, data);

    return c.json({ tag }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Tag creation error:", err);
    return c.json({ error: "Failed to create tag" }, 500);
  }
});

app.delete("/api/projects/:projectId/tags/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new ContactService(db);
    await service.deleteTag(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Tag deletion error:", err);
    return c.json({ error: "Failed to delete tag" }, 500);
  }
});

// Assign tag to contact
app.post("/api/projects/:projectId/contacts/:contactId/tags", async (c) => {
  try {
    const contactId = c.req.param("contactId");
    const body = await c.req.json();
    const { tagId } = body as { tagId: string };

    const db = c.get("db");
    const service = new ContactService(db);
    await service.addTag(contactId, tagId);

    return c.json({ success: true }, 201);
  } catch (err) {
    console.error("Tag assignment error:", err);
    return c.json({ error: "Failed to assign tag" }, 500);
  }
});

// Remove tag from contact
app.delete(
  "/api/projects/:projectId/contacts/:contactId/tags/:tagId",
  async (c) => {
    try {
      const contactId = c.req.param("contactId");
      const tagId = c.req.param("tagId");

      const db = c.get("db");
      const service = new ContactService(db);
      await service.removeTag(contactId, tagId);

      return c.json({ success: true });
    } catch (err) {
      console.error("Tag removal error:", err);
      return c.json({ error: "Failed to remove tag" }, 500);
    }
  },
);

// ─── Workflows ───────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/workflows", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const db = c.get("db");
    const service = new WorkflowService(db);
    const workflows = await service.list(projectId);
    return c.json({ workflows });
  } catch (err) {
    console.error("Workflows list error:", err);
    return c.json({ error: "Failed to fetch workflows" }, 500);
  }
});

app.post("/api/projects/:projectId/workflows", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const data = validate(createWorkflowSchema, body);

    const db = c.get("db");
    const planLimits = c.get("planLimits");
    const service = new WorkflowService(db);

    // Check plan limits
    const existing = await service.list(projectId);
    if (
      planLimits.maxWorkflows !== -1 &&
      existing.length >= planLimits.maxWorkflows
    ) {
      return c.json(
        {
          error: `Plan limit reached: maximum ${planLimits.maxWorkflows} workflow(s)`,
        },
        403,
      );
    }

    const workflow = await service.create(projectId, data);
    return c.json({ workflow }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Workflow creation error:", err);
    return c.json({ error: "Failed to create workflow" }, 500);
  }
});

app.put("/api/projects/:projectId/workflows/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(updateWorkflowSchema, body);

    const db = c.get("db");
    const service = new WorkflowService(db);
    const workflow = await service.update(id, data);

    if (!workflow) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    return c.json({ workflow });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Workflow update error:", err);
    return c.json({ error: "Failed to update workflow" }, 500);
  }
});

app.delete("/api/projects/:projectId/workflows/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new WorkflowService(db);

    const existing = await service.getById(id);
    if (!existing) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    await service.delete(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("Workflow deletion error:", err);
    return c.json({ error: "Failed to delete workflow" }, 500);
  }
});

// Full workflow with steps
app.get("/api/projects/:projectId/workflows/:workflowId", async (c) => {
  try {
    const workflowId = c.req.param("workflowId");
    const db = c.get("db");
    const service = new WorkflowService(db);
    const workflow = await service.getFullWorkflow(workflowId);

    if (!workflow) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    return c.json({ workflow });
  } catch (err) {
    console.error("Workflow fetch error:", err);
    return c.json({ error: "Failed to fetch workflow" }, 500);
  }
});

// Workflow steps
app.get("/api/projects/:projectId/workflows/:workflowId/steps", async (c) => {
  try {
    const workflowId = c.req.param("workflowId");
    const db = c.get("db");
    const service = new WorkflowService(db);
    const steps = await service.listSteps(workflowId);
    return c.json({ steps });
  } catch (err) {
    console.error("Workflow steps list error:", err);
    return c.json({ error: "Failed to fetch workflow steps" }, 500);
  }
});

app.post("/api/projects/:projectId/workflows/:workflowId/steps", async (c) => {
  try {
    const workflowId = c.req.param("workflowId");
    const body = await c.req.json();
    const data = validate(createWorkflowStepSchema, body);

    const db = c.get("db");
    const service = new WorkflowService(db);
    const step = await service.createStep(workflowId, data);

    return c.json({ step }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Workflow step creation error:", err);
    return c.json({ error: "Failed to create workflow step" }, 500);
  }
});

app.put(
  "/api/projects/:projectId/workflows/:workflowId/steps/reorder",
  async (c) => {
    try {
      const workflowId = c.req.param("workflowId");
      const body = await c.req.json();
      const { stepIds } = body as { stepIds: string[] };

      const db = c.get("db");
      const service = new WorkflowService(db);
      const steps = await service.reorderSteps(workflowId, stepIds);

      return c.json({ steps });
    } catch (err) {
      console.error("Workflow step reorder error:", err);
      return c.json({ error: "Failed to reorder workflow steps" }, 500);
    }
  },
);

app.put(
  "/api/projects/:projectId/workflows/:workflowId/steps/:id",
  async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();

      const db = c.get("db");
      const service = new WorkflowService(db);
      const step = await service.updateStep(id, body);

      if (!step) {
        return c.json({ error: "Step not found" }, 404);
      }

      return c.json({ step });
    } catch (err) {
      console.error("Workflow step update error:", err);
      return c.json({ error: "Failed to update workflow step" }, 500);
    }
  },
);

app.delete(
  "/api/projects/:projectId/workflows/:workflowId/steps/:id",
  async (c) => {
    try {
      const id = c.req.param("id");
      const db = c.get("db");
      const service = new WorkflowService(db);
      await service.deleteStep(id);
      return c.json({ success: true });
    } catch (err) {
      console.error("Workflow step deletion error:", err);
      return c.json({ error: "Failed to delete workflow step" }, 500);
    }
  },
);

// Workflow runs
app.get("/api/projects/:projectId/workflows/:workflowId/runs", async (c) => {
  try {
    const workflowId = c.req.param("workflowId");
    const limitParam = c.req.query("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const db = c.get("db");
    const service = new WorkflowService(db);
    const runs = await service.listRuns(workflowId, limit);

    return c.json({ runs });
  } catch (err) {
    console.error("Workflow runs list error:", err);
    return c.json({ error: "Failed to fetch workflow runs" }, 500);
  }
});

// ─── API Keys ────────────────────────────────────────────────────────────────

app.get("/api/projects/:projectId/api-keys", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const db = c.get("db");
    const service = new ApiKeyService(db);
    const apiKeys = await service.list(projectId);
    return c.json({ apiKeys });
  } catch (err) {
    console.error("API keys list error:", err);
    return c.json({ error: "Failed to fetch API keys" }, 500);
  }
});

app.post("/api/projects/:projectId/api-keys", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json();
    const data = validate(createApiKeySchema, body);

    const db = c.get("db");
    const service = new ApiKeyService(db);
    const result = await service.create(projectId, data.label);

    return c.json({ apiKey: result }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("API key creation error:", err);
    return c.json({ error: "Failed to create API key" }, 500);
  }
});

app.delete("/api/projects/:projectId/api-keys/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = c.get("db");
    const service = new ApiKeyService(db);
    await service.delete(id);
    return c.json({ success: true });
  } catch (err) {
    console.error("API key deletion error:", err);
    return c.json({ error: "Failed to delete API key" }, 500);
  }
});

// ─── Calendar ────────────────────────────────────────────────────────────────

app.post("/api/projects/:projectId/calendar/connect", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const db = c.get("db");
    const userId = c.get("effectiveUserId");
    const planLimits = c.get("planLimits");

    if (!planLimits.calendarSync) {
      return c.json(
        { error: "Calendar sync requires a Pro or Business plan" },
        403,
      );
    }

    // Check connection count limit
    if (planLimits.maxCalendarConnections !== -1) {
      const existing = await db
        .select()
        .from(dbSchema.calendarConnections)
        .where(eq(dbSchema.calendarConnections.userId, userId));

      if (existing.length >= planLimits.maxCalendarConnections) {
        return c.json(
          { error: `Plan limit reached: maximum ${planLimits.maxCalendarConnections} calendar connection(s)` },
          403,
        );
      }
    }

    const calendarService = new CalendarService(db, {
      GOOGLE_CALENDAR_CLIENT_ID: c.env.GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: c.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    });

    // Static redirect URI (registered in Google Cloud Console)
    const baseUrl = c.env.BETTER_AUTH_URL;
    const redirectUri = `${baseUrl}/api/integrations/gcal/callback`;

    // Encode projectId + optional returnUrl in OAuth state param
    const body = await c.req.json().catch(() => ({}));
    const returnUrl = (body as Record<string, unknown>).returnUrl as string | undefined;
    const state = JSON.stringify({ projectId, returnUrl });

    const url = calendarService.getOAuthUrl(redirectUri, state);
    return c.json({ url });
  } catch (err) {
    console.error("Calendar connect error:", err);
    return c.json({ error: "Failed to generate OAuth URL" }, 500);
  }
});

app.get("/api/integrations/gcal/callback", async (c) => {
  try {
    const code = c.req.query("code");
    const stateParam = c.req.query("state");

    if (!code) {
      return c.json({ error: "Missing authorization code" }, 400);
    }

    // Decode projectId and returnUrl from the state param
    let projectId: string | undefined;
    let returnUrl: string | undefined;
    if (stateParam) {
      try {
        const parsed = JSON.parse(stateParam) as { projectId?: string; returnUrl?: string };
        projectId = parsed.projectId;
        returnUrl = parsed.returnUrl;
      } catch {
        // state wasn't JSON, ignore
      }
    }

    const db = c.get("db");
    const userId = c.get("effectiveUserId");

    const calendarService = new CalendarService(db, {
      GOOGLE_CALENDAR_CLIENT_ID: c.env.GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: c.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    });

    // Must match the redirect URI used when generating the OAuth URL
    const baseUrl = c.env.BETTER_AUTH_URL;
    const redirectUri = `${baseUrl}/api/integrations/gcal/callback`;

    const tokens = await calendarService.exchangeCode(code, redirectUri);

    const id = crypto.randomUUID();
    await db.insert(dbSchema.calendarConnections).values({
      id,
      userId,
      provider: "google",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      email: tokens.email,
    });

    // Redirect back to the page that initiated the connection
    if (returnUrl) {
      const separator = returnUrl.includes("?") ? "&" : "?";
      return c.redirect(`${returnUrl}${separator}connected=true`);
    }
    if (projectId) {
      return c.redirect(`/app/projects/${projectId}/settings?connected=true`);
    }
    return c.redirect("/app");
  } catch (err) {
    console.error("Calendar callback error:", err);
    return c.json({ error: "Failed to connect calendar" }, 500);
  }
});

app.get("/api/projects/:projectId/calendar/connections", async (c) => {
  const userId = c.get("effectiveUserId");
  const db = c.get("db");

  const rows = await db
    .select({
      id: dbSchema.calendarConnections.id,
      provider: dbSchema.calendarConnections.provider,
      email: dbSchema.calendarConnections.email,
      createdAt: dbSchema.calendarConnections.createdAt,
    })
    .from(dbSchema.calendarConnections)
    .where(eq(dbSchema.calendarConnections.userId, userId));

  return c.json({ connections: rows });
});

app.delete("/api/projects/:projectId/calendar/connections/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = c.get("effectiveUserId");
    const db = c.get("db");

    // Verify the connection belongs to the current user
    const [connection] = await db
      .select()
      .from(dbSchema.calendarConnections)
      .where(
        and(
          eq(dbSchema.calendarConnections.id, id),
          eq(dbSchema.calendarConnections.userId, userId),
        ),
      )
      .limit(1);

    if (!connection) {
      return c.json({ error: "Calendar connection not found" }, 404);
    }

    await db
      .delete(dbSchema.calendarConnections)
      .where(eq(dbSchema.calendarConnections.id, id));

    return c.json({ success: true });
  } catch (err) {
    console.error("Calendar connection deletion error:", err);
    return c.json({ error: "Failed to delete calendar connection" }, 500);
  }
});

// ─── Calendar: List Sub-Calendars ────────────────────────────────────────────

app.get("/api/calendar/calendars", async (c) => {
  try {
    const userId = c.get("effectiveUserId");
    const db = c.get("db");

    const connections = await db
      .select()
      .from(dbSchema.calendarConnections)
      .where(eq(dbSchema.calendarConnections.userId, userId));

    if (connections.length === 0) {
      return c.json({ accounts: [] });
    }

    const calendarService = new CalendarService(db, {
      GOOGLE_CALENDAR_CLIENT_ID: c.env.GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: c.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    });

    const accounts = [];
    for (const conn of connections) {
      try {
        const accessToken = await calendarService.refreshAccessToken(conn.refreshToken);
        const calendars = await calendarService.listCalendars(accessToken);
        accounts.push({
          connectionId: conn.id,
          email: conn.email,
          calendars,
        });
      } catch (err) {
        console.error(`Failed to list calendars for ${conn.email}:`, err);
        // Skip broken connections gracefully
        accounts.push({
          connectionId: conn.id,
          email: conn.email,
          calendars: [],
        });
      }
    }

    return c.json({ accounts });
  } catch (err) {
    console.error("List calendars error:", err);
    return c.json({ error: "Failed to list calendars" }, 500);
  }
});

// ─── Calendar: Event Type Calendar Config ────────────────────────────────────

app.get("/api/projects/:projectId/event-types/:eventTypeId/calendars", async (c) => {
  try {
    const eventTypeId = c.req.param("eventTypeId");
    const db = c.get("db");

    const [eventType] = await db
      .select()
      .from(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.id, eventTypeId))
      .limit(1);

    if (!eventType) {
      return c.json({ error: "Event type not found" }, 404);
    }

    const busyCalendars = await db
      .select()
      .from(dbSchema.eventTypeBusyCalendars)
      .where(eq(dbSchema.eventTypeBusyCalendars.eventTypeId, eventTypeId));

    return c.json({
      destination: eventType.destinationConnectionId
        ? {
            connectionId: eventType.destinationConnectionId,
            calendarId: eventType.destinationCalendarId,
          }
        : null,
      busyCalendars: busyCalendars.map((bc) => ({
        connectionId: bc.connectionId,
        calendarId: bc.calendarId,
      })),
    });
  } catch (err) {
    console.error("Get event type calendars error:", err);
    return c.json({ error: "Failed to get calendar config" }, 500);
  }
});

app.put("/api/projects/:projectId/event-types/:eventTypeId/calendars", async (c) => {
  try {
    const eventTypeId = c.req.param("eventTypeId");
    const body = await c.req.json();
    const data = validate(updateEventTypeCalendarsSchema, body);
    const db = c.get("db");

    // Update destination on event type
    await db
      .update(dbSchema.eventTypes)
      .set({
        destinationConnectionId: data.destination?.connectionId ?? null,
        destinationCalendarId: data.destination?.calendarId ?? null,
      })
      .where(eq(dbSchema.eventTypes.id, eventTypeId));

    // Replace busy calendars: delete all, then insert new
    await db
      .delete(dbSchema.eventTypeBusyCalendars)
      .where(eq(dbSchema.eventTypeBusyCalendars.eventTypeId, eventTypeId));

    if (data.busyCalendars.length > 0) {
      await db.insert(dbSchema.eventTypeBusyCalendars).values(
        data.busyCalendars.map((bc) => ({
          id: crypto.randomUUID(),
          eventTypeId,
          connectionId: bc.connectionId,
          calendarId: bc.calendarId,
        })),
      );
    }

    return c.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Update event type calendars error:", err);
    return c.json({ error: "Failed to update calendar config" }, 500);
  }
});

// ─── Billing ─────────────────────────────────────────────────────────────────

app.post("/api/billing/checkout", async (c) => {
  try {
    const body = await c.req.json();
    const { plan, interval, successUrl, cancelUrl } = body as {
      plan: string;
      interval: "month" | "year";
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!["pro", "business"].includes(plan)) {
      return c.json({ error: "Invalid plan" }, 400);
    }
    if (!["month", "year"].includes(interval)) {
      return c.json({ error: "Invalid interval" }, 400);
    }

    const user = c.get("user");
    const db = c.get("db");
    const stripe = getStripe(c.env);
    const priceId = getPriceId(c.env, plan as "pro" | "business", interval);

    // Get or create Stripe customer
    const [sub] = await db
      .select()
      .from(dbSchema.subscriptions)
      .where(eq(dbSchema.subscriptions.userId, user.id))
      .limit(1);

    let customerId = sub?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      // Upsert subscription record with customer ID
      if (sub) {
        await db
          .update(dbSchema.subscriptions)
          .set({ stripeCustomerId: customerId })
          .where(eq(dbSchema.subscriptions.id, sub.id));
      } else {
        await db.insert(dbSchema.subscriptions).values({
          id: crypto.randomUUID(),
          userId: user.id,
          stripeCustomerId: customerId,
          plan: "free",
          interval: "monthly",
          status: "active",
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      billing_address_collection: "auto",
      customer: customerId,
      customer_update: { address: "auto" },
      allow_promotion_codes: true,
      line_items: [{ quantity: 1, price: priceId }],
      success_url: successUrl || `${c.req.header("origin") ?? c.env.BETTER_AUTH_URL}/billing?success=true`,
      cancel_url: cancelUrl || `${c.req.header("origin") ?? c.env.BETTER_AUTH_URL}/billing?canceled=true`,
      metadata: { plan, interval, userId: user.id },
    });

    return c.json({ url: session.url });
  } catch (err) {
    console.error("Checkout session creation error:", err);
    return c.json({ error: "Failed to create checkout session" }, 500);
  }
});

app.post("/api/billing/portal", async (c) => {
  try {
    const user = c.get("user");
    const db = c.get("db");

    const [sub] = await db
      .select()
      .from(dbSchema.subscriptions)
      .where(eq(dbSchema.subscriptions.userId, user.id))
      .limit(1);

    if (!sub?.stripeCustomerId) {
      return c.json({ error: "No billing account found" }, 400);
    }

    const stripe = getStripe(c.env);
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${c.req.header("origin") ?? c.env.BETTER_AUTH_URL}/billing`,
    });

    return c.json({ url: session.url });
  } catch (err) {
    console.error("Portal session creation error:", err);
    return c.json({ error: "Failed to create portal session" }, 500);
  }
});

app.get("/api/billing/subscription", async (c) => {
  const subscription = c.get("subscription");
  const planLimits = c.get("planLimits");
  return c.json({ subscription, planLimits });
});

// ─── Onboarding ──────────────────────────────────────────────────────────────

app.post("/api/onboarding", async (c) => {
  try {
    const body = await c.req.json();
    const data = validate(createProjectSchema, body);

    const db = c.get("db");
    const userId = c.get("effectiveUserId");
    const planLimits = c.get("planLimits");

    // Check plan limits for projects
    const existingProjects = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.userId, userId));

    if (
      planLimits.maxProjects !== -1 &&
      existingProjects.length >= planLimits.maxProjects
    ) {
      return c.json(
        {
          error: `Plan limit reached: maximum ${planLimits.maxProjects} project(s)`,
        },
        403,
      );
    }

    // Check for slug uniqueness
    const [existingSlug] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, data.slug))
      .limit(1);

    if (existingSlug) {
      return c.json({ error: "Slug is already taken" }, 409);
    }

    // Create the project
    const projectId = crypto.randomUUID();
    await db.insert(dbSchema.projects).values({
      id: projectId,
      userId,
      name: data.name,
      slug: data.slug,
      timezone: data.timezone,
      onboarded: false,
    });

    // Create default schedule with Mon-Fri 9-5
    const scheduleService = new ScheduleService(db);
    await scheduleService.createDefaultSchedule(projectId, data.timezone);

    // Fetch the created project to return
    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, projectId))
      .limit(1);

    return c.json({ project }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Onboarding error:", err);
    return c.json({ error: "Failed to complete onboarding" }, 500);
  }
});

app.post("/api/onboarding/complete", async (c) => {
  try {
    const body = await c.req.json();
    const { projectId } = body as { projectId: string };

    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const db = c.get("db");
    const userId = c.get("effectiveUserId");

    // Verify project belongs to user
    const [project] = await db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, projectId))
      .limit(1);

    if (!project || project.userId !== userId) {
      return c.json({ error: "Project not found" }, 404);
    }

    await db
      .update(dbSchema.projects)
      .set({ onboarded: true })
      .where(eq(dbSchema.projects.id, projectId));

    return c.json({ success: true });
  } catch (err) {
    console.error("Onboarding complete error:", err);
    return c.json({ error: "Failed to complete onboarding" }, 500);
  }
});

// ─── LLMs.txt ────────────────────────────────────────────────────────────────

app.get("/llms.txt", (c) => {
  return c.text(`# LinkyCal API
> Form & Scheduling infrastructure. API-first.

## Endpoints
- GET /api/v1/availability/:projectSlug - Check available time slots
- POST /api/v1/bookings - Create a booking
- DELETE /api/v1/bookings/:id - Cancel a booking
- POST /api/v1/forms/:slug/responses - Start a form response
- PATCH /api/v1/forms/:slug/responses/:id/steps/:step - Submit form step
- GET /api/v1/contacts - List contacts (coming soon)

## Auth
Bearer token via API key: Authorization: Bearer lc_live_...

## Docs
/docs
`);
});

// ─── SPA Fallback ────────────────────────────────────────────────────────────

app.use(
  "*",
  except(["/api/*"], async (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
  }),
);

// ─── Queue Consumer ──────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: import("./types").AppEnv,
    _ctx: ExecutionContext,
  ) {
    try {
      const db = drizzle(env.DB, { schema });
      const bookingService = new BookingService(db);
      const expired = await bookingService.expirePendingBookings();

      if (expired.length > 0) {
        const emailService = new EmailService(env.RESEND_API_KEY);
        for (const booking of expired) {
          try {
            const [eventType] = await db
              .select()
              .from(dbSchema.eventTypes)
              .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
              .limit(1);

            await emailService.sendBookingDeclined({
              to: booking.email,
              guestName: booking.name,
              eventTypeName: eventType?.name ?? "Meeting",
              startTime: new Date(booking.startTime),
              endTime: new Date(booking.endTime),
              timezone: booking.timezone,
            });
          } catch (err) {
            console.error(`Failed to send expire email for booking ${booking.id}:`, err);
          }
        }
        console.log(`Auto-declined ${expired.length} expired booking(s)`);
      }
    } catch (err) {
      console.error("Cron: expire pending bookings failed:", err);
    }
  },

  async queue(
    batch: MessageBatch<{ workflowRunId: string; stepIndex: number }>,
  ) {
    for (const message of batch.messages) {
      try {
        const { workflowRunId, stepIndex } = message.body;
        // TODO: Execute workflow step
        // 1. Load workflow run + step config
        // 2. Execute step action (send_email, add_tag, etc.)
        // 3. Update workflow run progress
        // 4. If more steps, enqueue next step
        // 5. If done, mark run as completed
        console.log(
          `Processing workflow run ${workflowRunId} step ${stepIndex}`,
        );
        message.ack();
      } catch (err) {
        console.error("Workflow step failed:", err);
        message.retry();
      }
    }
  },
};
