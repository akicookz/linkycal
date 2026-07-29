import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type { AnalyticsQueryParams } from "../services/analytics-service";
import {
  emptyDetailedFunnel,
  queryBookings,
  queryFilterOptions,
  queryForms,
  queryOverview,
} from "../services/analytics-service";
import * as dbSchema from "../db/schema";
import type { PlanLimits } from "../types";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;
type CommonAnalyticsQuery = Omit<AnalyticsQueryParams, "projectId">;

export interface AnalyticsActionEnv {
  CF_ACCOUNT_ID: string;
  WAE_API_TOKEN: string;
}

interface AnalyticsActionInput {
  db: AppDatabase;
  env: AnalyticsActionEnv;
  projectId: string;
  planLimits: PlanLimits;
}

interface AnalyticsQueryActionInput extends AnalyticsActionInput {
  query: CommonAnalyticsQuery;
}

function analyticsForbidden() {
  return {
    ok: false as const,
    status: 403 as const,
    body: {
      error: "Analytics requires a Pro or Business plan",
    },
  };
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
  if (!input.planLimits.analytics) return analyticsForbidden();
  const body = await queryOverview(
    input.env.CF_ACCOUNT_ID,
    input.env.WAE_API_TOKEN,
    {
      projectId: input.projectId,
      ...input.query,
    },
  );
  return { ok: true as const, status: 200 as const, body };
}

export async function getBookingAnalyticsAction(
  input: AnalyticsQueryActionInput,
) {
  if (!input.planLimits.analytics) return analyticsForbidden();
  if (
    input.query.resourceSlug &&
    !(await ownsEventTypeSlug(
      input.db,
      input.projectId,
      input.query.resourceSlug,
    ))
  ) {
    return {
      ok: true as const,
      status: 200 as const,
      body: emptyBookingReport(),
    };
  }

  const body = await queryBookings(
    input.env.CF_ACCOUNT_ID,
    input.env.WAE_API_TOKEN,
    {
      projectId: input.projectId,
      ...input.query,
    },
  );
  return { ok: true as const, status: 200 as const, body };
}

export async function getFormAnalyticsAction(
  input: AnalyticsQueryActionInput,
) {
  if (!input.planLimits.analytics) return analyticsForbidden();
  if (
    input.query.resourceSlug &&
    !(await ownsFormSlug(
      input.db,
      input.projectId,
      input.query.resourceSlug,
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
      ...input.query,
    },
  );
  return { ok: true as const, status: 200 as const, body };
}

export async function getAnalyticsFiltersAction(
  input: AnalyticsActionInput,
) {
  if (!input.planLimits.analytics) return analyticsForbidden();
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
