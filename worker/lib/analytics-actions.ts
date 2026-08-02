import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type {
  AnalyticsProvider,
  CanonicalFunnelEvent,
} from "../../shared/funnel-analytics";
import type { AnalyticsQueryParams } from "../services/analytics-service";
import {
  emptyDetailedFunnel,
  queryBookingDemand,
  queryBookings,
  queryFilterOptions,
  queryForms,
  queryOverview,
  writeAnalyticsEvent,
} from "../services/analytics-service";
import * as dbSchema from "../db/schema";
import type { PlanLimits } from "../types";
import {
  PLAN_CATALOG,
  type EntitlementDecision,
} from "../../shared/plan-catalog";
import { AnalyticsIntegrationService } from "../services/analytics-integration-service";
import { configureAnalyticsIntegrationSchema } from "../validation";
import { queryBookingRequestAnalytics } from "./booking-request-analytics";
import { entitlementError } from "./entitlement-errors";
import {
  applyEntitlementEnforcement,
  resolveEnforcementMode,
} from "./entitlement-mode";
import { EntitlementService } from "../services/entitlement-service";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;
type CommonAnalyticsQuery = Omit<AnalyticsQueryParams, "projectId">;

export interface AnalyticsActionEnv {
  CF_ACCOUNT_ID: string;
  WAE_API_TOKEN: string;
  ENTITLEMENT_ENFORCEMENT_MODE?: string;
  ENTITLEMENT_OBSERVE_KEYS?: string;
}

interface AnalyticsActionInput {
  db: AppDatabase;
  env: AnalyticsActionEnv;
  projectId: string;
  planLimits: PlanLimits;
}

interface ConfigureAnalyticsIntegrationActionInput
  extends AnalyticsActionInput {
  provider: string;
  body: unknown;
}

interface AnalyticsQueryActionInput extends AnalyticsActionInput {
  query: CommonAnalyticsQuery;
  now?: Date;
}

interface BookingAnalyticsActionInput extends AnalyticsActionInput {
  query: CommonAnalyticsQuery & { timezone: string };
  now?: Date;
}

async function analyticsForbidden(input: AnalyticsActionInput) {
  const evaluatedDecision: EntitlementDecision = {
    key: "analytics",
    kind: "feature" as const,
    scope: "workspace" as const,
    enabled: false,
    allowed: false,
    status: "unavailable",
    used: null,
    limit: null,
    hardLimit: null,
    periodStart: null,
    resetAt: null,
    recommendedPlan: "pro",
  };
  let decision = evaluatedDecision;
  if (resolveEnforcementMode(input.env, "analytics") === "observe") {
    const resolved = await new EntitlementService(input.db).resolveProject(
      input.projectId,
    );
    if (resolved) {
      decision = applyEntitlementEnforcement(evaluatedDecision, {
        env: input.env,
        workspace: resolved.workspace,
        projectId: input.projectId,
        plan: resolved.subscription.plan,
        channel: "analytics",
      });
    }
  }
  if (decision.allowed) return null;
  const failure = entitlementError(decision, "view analytics");
  return {
    ok: false as const,
    status: failure.status,
    body: failure.body,
  };
}

export function applyAnalyticsRetention(
  query: CommonAnalyticsQuery,
  retentionMonths: number,
  now = new Date(),
): CommonAnalyticsQuery {
  if (query.period !== "custom" || !query.start || !query.end) return query;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return {
    ...query,
    start: query.start < cutoffDate ? cutoffDate : query.start,
    end: query.end < cutoffDate ? cutoffDate : query.end,
  };
}

function effectiveAnalyticsRetentionMonths(
  input: AnalyticsActionInput,
): number {
  if (input.planLimits.analyticsRetentionMonths > 0) {
    return input.planLimits.analyticsRetentionMonths;
  }
  return PLAN_CATALOG.pro.entitlements.analyticsRetentionMonths.limit ?? 12;
}

function emptyBookingReport() {
  return {
    funnel: {
      pageViews: 0,
      bookingsCreated: 0,
      conversionRate: 0,
    },
    byEventType: [],
    timeSeries: [],
    ...emptyDetailedFunnel(),
    clickedWeekdays: [],
    selectedDateAvailability: [],
    bookedWeekdays: [],
    bookedTimes: [],
  };
}

function emptyFormReport() {
  return {
    funnel: {
      views: 0,
      started: 0,
      completed: 0,
      startRate: 0,
      completionRate: 0,
    },
    byForm: [],
    timeSeries: [],
    ...emptyDetailedFunnel(),
  };
}

async function ownsEventTypeSlug(
  db: AppDatabase,
  projectId: string,
  slug: string,
): Promise<boolean> {
  const [eventType] = await db
    .select({ id: dbSchema.eventTypes.id })
    .from(dbSchema.eventTypes)
    .where(
      and(
        eq(dbSchema.eventTypes.projectId, projectId),
        eq(dbSchema.eventTypes.slug, slug),
      ),
    )
    .limit(1);
  return !!eventType;
}

async function ownsFormSlug(
  db: AppDatabase,
  projectId: string,
  slug: string,
): Promise<boolean> {
  const [form] = await db
    .select({ id: dbSchema.forms.id })
    .from(dbSchema.forms)
    .where(
      and(
        eq(dbSchema.forms.projectId, projectId),
        eq(dbSchema.forms.slug, slug),
      ),
    )
    .limit(1);
  return !!form;
}

export async function getAnalyticsOverviewAction(
  input: AnalyticsQueryActionInput,
) {
  if (!input.planLimits.analytics) {
    const denial = await analyticsForbidden(input);
    if (denial) return denial;
  }
  const query = applyAnalyticsRetention(
    input.query,
    effectiveAnalyticsRetentionMonths(input),
    input.now,
  );
  const body = await queryOverview(
    input.env.CF_ACCOUNT_ID,
    input.env.WAE_API_TOKEN,
    {
      projectId: input.projectId,
      ...query,
    },
  );
  return { ok: true as const, status: 200 as const, body };
}

export async function getBookingAnalyticsAction(
  input: BookingAnalyticsActionInput,
) {
  if (!input.planLimits.analytics) {
    const denial = await analyticsForbidden(input);
    if (denial) return denial;
  }
  const query = applyAnalyticsRetention(
    input.query,
    effectiveAnalyticsRetentionMonths(input),
    input.now,
  ) as CommonAnalyticsQuery & { timezone: string };
  if (
    query.resourceSlug &&
    !(await ownsEventTypeSlug(
      input.db,
      input.projectId,
      query.resourceSlug,
    ))
  ) {
    return {
      ok: true as const,
      status: 200 as const,
      body: emptyBookingReport(),
    };
  }

  const analyticsQuery = {
    projectId: input.projectId,
    ...query,
  };
  const [report, demand, bookingRequests] = await Promise.all([
    queryBookings(
      input.env.CF_ACCOUNT_ID,
      input.env.WAE_API_TOKEN,
      analyticsQuery,
    ),
    queryBookingDemand(
      input.env.CF_ACCOUNT_ID,
      input.env.WAE_API_TOKEN,
      analyticsQuery,
    ),
    queryBookingRequestAnalytics({
      db: input.db,
      projectId: input.projectId,
      period: query.period,
      start: query.start,
      end: query.end,
      resourceSlug: query.resourceSlug,
      timezone: query.timezone,
    }),
  ]);
  return {
    ok: true as const,
    status: 200 as const,
    body: { ...report, ...demand, ...bookingRequests },
  };
}

export async function getFormAnalyticsAction(
  input: AnalyticsQueryActionInput,
) {
  if (!input.planLimits.analytics) {
    const denial = await analyticsForbidden(input);
    if (denial) return denial;
  }
  const query = applyAnalyticsRetention(
    input.query,
    effectiveAnalyticsRetentionMonths(input),
    input.now,
  );
  if (
    query.resourceSlug &&
    !(await ownsFormSlug(
      input.db,
      input.projectId,
      query.resourceSlug,
    ))
  ) {
    return {
      ok: true as const,
      status: 200 as const,
      body: emptyFormReport(),
    };
  }

  const body = await queryForms(
    input.env.CF_ACCOUNT_ID,
    input.env.WAE_API_TOKEN,
    {
      projectId: input.projectId,
      ...query,
    },
  );
  return { ok: true as const, status: 200 as const, body };
}

export async function getAnalyticsFiltersAction(
  input: AnalyticsActionInput,
) {
  if (!input.planLimits.analytics) {
    const denial = await analyticsForbidden(input);
    if (denial) return denial;
  }
  const [observed, eventTypes, forms] = await Promise.all([
    queryFilterOptions(
      input.env.CF_ACCOUNT_ID,
      input.env.WAE_API_TOKEN,
      input.projectId,
    ),
    input.db
      .select({
        id: dbSchema.eventTypes.id,
        slug: dbSchema.eventTypes.slug,
        name: dbSchema.eventTypes.name,
      })
      .from(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.projectId, input.projectId)),
    input.db
      .select({
        id: dbSchema.forms.id,
        slug: dbSchema.forms.slug,
        name: dbSchema.forms.name,
      })
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.projectId, input.projectId)),
  ]);
  return {
    ok: true as const,
    status: 200 as const,
    body: {
      ...observed,
      eventTypes,
      forms,
    },
  };
}

export async function listAnalyticsIntegrationsAction(
  input: AnalyticsActionInput,
) {
  if (!input.planLimits.analytics) {
    const denial = await analyticsForbidden(input);
    if (denial) return denial;
  }
  const integrations = await new AnalyticsIntegrationService(input.db).list(
    input.projectId,
  );
  if (!integrations) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Project not found" },
    };
  }
  return {
    ok: true as const,
    status: 200 as const,
    body: { integrations },
  };
}

function isAnalyticsProvider(value: string): value is AnalyticsProvider {
  return value === "ga4" ||
    value === "meta_pixel" ||
    value === "posthog";
}

export async function configureAnalyticsIntegrationAction(
  input: ConfigureAnalyticsIntegrationActionInput,
) {
  if (!input.planLimits.analytics) {
    const denial = await analyticsForbidden(input);
    if (denial) return denial;
  }
  if (!isAnalyticsProvider(input.provider)) {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: "Invalid analytics integration provider" },
    };
  }
  const body =
    input.body && typeof input.body === "object" && !Array.isArray(input.body)
      ? input.body as Record<string, unknown>
      : {};
  if (
    typeof body.provider === "string" &&
    body.provider !== input.provider
  ) {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: "Invalid analytics integration" },
    };
  }
  const parsed = configureAnalyticsIntegrationSchema.safeParse({
    ...body,
    provider: input.provider,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: "Invalid analytics integration" },
    };
  }
  if (
    parsed.data.enabled &&
    ((parsed.data.provider === "ga4" && !parsed.data.measurementId) ||
      (parsed.data.provider === "meta_pixel" && !parsed.data.pixelId) ||
      (parsed.data.provider === "posthog" && !parsed.data.projectKey))
  ) {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: "Invalid analytics integration" },
    };
  }

  const integration = await new AnalyticsIntegrationService(
    input.db,
  ).configure(input.projectId, parsed.data);
  if (!integration) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Project not found" },
    };
  }
  return {
    ok: true as const,
    status: 200 as const,
    body: { integration },
  };
}

export async function writeAnonymousAnalyticsEvents(input: {
  db: AppDatabase;
  analytics: AnalyticsEngineDataset;
  events: CanonicalFunnelEvent[];
  country?: string;
  city?: string;
}): Promise<void> {
  const events = input.events.slice(0, 20);
  const projectSlugs = [...new Set(events.map(function projectSlug(event) {
    return event.projectSlug;
  }))];
  if (projectSlugs.length === 0) return;

  const projects = await input.db
    .select({
      id: dbSchema.projects.id,
      slug: dbSchema.projects.slug,
    })
    .from(dbSchema.projects)
    .where(inArray(dbSchema.projects.slug, projectSlugs));
  const projectIds = new Map(
    projects.map(function projectEntry(project) {
      return [project.slug, project.id] as const;
    }),
  );

  for (const event of events) {
    const projectId = projectIds.get(event.projectSlug);
    if (!projectId) continue;
    writeAnalyticsEvent(input.analytics, {
      ...event,
      projectId,
      country: input.country,
      city: input.city,
    });
  }
}
