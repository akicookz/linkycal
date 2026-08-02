import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import { EventTypeService } from "../services/event-type-service";
import { FormService } from "../services/form-service";
import { CustomCssService } from "../services/custom-css-service";
import {
  AnalyticsIntegrationService,
  stripAnalyticsIntegrationsFromSettings,
} from "../services/analytics-integration-service";
import { resolveProjectEntitlements } from "./entitlements";
import { getViewerAvailableWeekdays } from "./timezone";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export async function loadPublicEventTypeAction(
  db: AppDatabase,
  projectSlug: string,
  eventSlug: string,
  viewerTimezone?: string,
) {
  const [project] = await db
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.slug, projectSlug))
    .limit(1);

  if (!project) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Project not found" },
    };
  }

  const eventType = await new EventTypeService(db).getBySlug(
    project.id,
    eventSlug,
  );
  if (!eventType || !eventType.enabled) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Event type not found" },
    };
  }

  const [owner] = await db
    .select({
      name: dbSchema.schema.users.name,
      image: dbSchema.schema.users.image,
    })
    .from(dbSchema.schema.users)
    .where(eq(dbSchema.schema.users.id, project.userId))
    .limit(1);

  let bookingForm = null;
  if (eventType.bookingFormId) {
    const fullForm = await new FormService(db).getFullForm(
      eventType.bookingFormId,
    );
    if (fullForm && fullForm.status === "active") {
      bookingForm = fullForm;
    }
  }

  let availableDays: number[] = [];
  if (eventType.scheduleId) {
    const rules = await db
      .select({
        dayOfWeek: dbSchema.availabilityRules.dayOfWeek,
        startTime: dbSchema.availabilityRules.startTime,
        endTime: dbSchema.availabilityRules.endTime,
      })
      .from(dbSchema.availabilityRules)
      .where(eq(
        dbSchema.availabilityRules.scheduleId,
        eventType.scheduleId,
      ));

    let projected: number[] | null = null;
    if (viewerTimezone && rules.length > 0) {
      const [schedule] = await db
        .select({ timezone: dbSchema.schedules.timezone })
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.id, eventType.scheduleId))
        .limit(1);
      if (schedule) {
        try {
          projected = getViewerAvailableWeekdays(
            rules,
            schedule.timezone,
            viewerTimezone,
          );
        } catch {
          projected = null;
        }
      }
    }
    availableDays =
      projected ?? [...new Set(rules.map((rule) => rule.dayOfWeek))];
  }

  const entitlements = await resolveProjectEntitlements(db, project.id);
  const canHideBranding = entitlements?.planLimits.removeBranding === true;
  const compiledCss = entitlements
    ? await new CustomCssService(db).getPublished(
        project.id,
        entitlements.subscription.plan,
      )
    : null;
  const analyticsIntegrations = await new AnalyticsIntegrationService(
    db,
  ).getPublished(project.id);

  return {
    ok: true as const,
    status: 200 as const,
    body: {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        settings: stripAnalyticsIntegrationsFromSettings(project.settings),
      },
      owner: owner ? { name: owner.name, image: owner.image } : null,
      eventType,
      bookingForm,
      availableDays,
      canHideBranding,
      compiledCss,
      analyticsIntegrations,
    },
  };
}
