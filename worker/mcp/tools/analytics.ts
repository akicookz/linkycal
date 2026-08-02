import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as dbSchema from "../../db/schema";
import {
  configureAnalyticsIntegrationAction,
  getAnalyticsOverviewAction,
  getBookingAnalyticsAction,
  getFormAnalyticsAction,
  listAnalyticsIntegrationsAction,
} from "../../lib/analytics-actions";
import {
  analyticsQuerySchema,
  bookingAnalyticsQuerySchema,
} from "../../validation";
import type { ToolContext } from "../agent";
import {
  err,
  getPlanLimitsForProject,
  ok,
  withToolErrorsForContext,
} from "../helpers";
import type { ToolResult } from "../helpers";

interface CommonAnalyticsInput {
  period?: "7d" | "30d" | "90d" | "custom";
  start?: string;
  end?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  source?: "direct" | "widget";
  deviceType?: "mobile" | "tablet" | "desktop";
}

interface BookingAnalyticsInput extends CommonAnalyticsInput {
  eventTypeId?: string;
  timezone: string;
}

interface FormAnalyticsInput extends CommonAnalyticsInput {
  formId?: string;
}

interface ConfigureIntegrationInput {
  provider: "ga4" | "meta_pixel" | "posthog";
  enabled: boolean;
  measurementId?: string;
  pixelId?: string;
  projectKey?: string;
  host?: "us" | "eu";
}

function parseCommonQuery(input: CommonAnalyticsInput) {
  return analyticsQuerySchema.parse({
    period: input.period,
    start: input.start,
    end: input.end,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    source: input.source,
    deviceType: input.deviceType,
  });
}

function actionResult(
  result:
    | { ok: true; body: unknown }
    | { ok: false; body: { error: string } },
): ToolResult {
  return result.ok ? ok(result.body) : err(result.body.error);
}

async function actionInput(ctx: ToolContext) {
  const db = ctx.db();
  const projectId = ctx.projectId();
  return {
    db,
    env: ctx.env(),
    projectId,
    planLimits: await getPlanLimitsForProject(db, projectId),
  };
}

export async function getAnalyticsOverview(
  ctx: ToolContext,
  input: CommonAnalyticsInput,
): Promise<ToolResult> {
  return actionResult(await getAnalyticsOverviewAction({
    ...(await actionInput(ctx)),
    query: parseCommonQuery(input),
  }));
}

export async function getBookingFunnelAnalytics(
  ctx: ToolContext,
  input: BookingAnalyticsInput,
): Promise<ToolResult> {
  const common = await actionInput(ctx);
  let resourceSlug: string | undefined;
  if (input.eventTypeId) {
    const [eventType] = await common.db
      .select({ slug: dbSchema.eventTypes.slug })
      .from(dbSchema.eventTypes)
      .where(
        and(
          eq(dbSchema.eventTypes.id, input.eventTypeId),
          eq(dbSchema.eventTypes.projectId, common.projectId),
        ),
      )
      .limit(1);
    if (!eventType) return err("Not found");
    resourceSlug = eventType.slug;
  }
  return actionResult(await getBookingAnalyticsAction({
    ...common,
    query: bookingAnalyticsQuerySchema.parse({
      ...parseCommonQuery(input),
      timezone: input.timezone,
      ...(resourceSlug ? { resourceSlug } : {}),
    }),
  }));
}

export async function getFormFunnelAnalytics(
  ctx: ToolContext,
  input: FormAnalyticsInput,
): Promise<ToolResult> {
  const common = await actionInput(ctx);
  let resourceSlug: string | undefined;
  if (input.formId) {
    const [form] = await common.db
      .select({ slug: dbSchema.forms.slug })
      .from(dbSchema.forms)
      .where(
        and(
          eq(dbSchema.forms.id, input.formId),
          eq(dbSchema.forms.projectId, common.projectId),
        ),
      )
      .limit(1);
    if (!form) return err("Not found");
    resourceSlug = form.slug;
  }
  return actionResult(await getFormAnalyticsAction({
    ...common,
    query: {
      ...parseCommonQuery(input),
      ...(resourceSlug ? { resourceSlug } : {}),
    },
  }));
}

export async function listAnalyticsIntegrations(
  ctx: ToolContext,
): Promise<ToolResult> {
  return actionResult(
    await listAnalyticsIntegrationsAction(await actionInput(ctx)),
  );
}

export async function configureAnalyticsIntegration(
  ctx: ToolContext,
  input: ConfigureIntegrationInput,
): Promise<ToolResult> {
  const { provider, ...body } = input;
  return actionResult(await configureAnalyticsIntegrationAction({
    ...(await actionInput(ctx)),
    provider,
    body,
  }));
}

const commonInputShape = {
  period: z
    .enum(["7d", "30d", "90d", "custom"])
    .optional()
    .describe("Reporting period (default 30d)"),
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Custom range start date, YYYY-MM-DD"),
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Custom range end date, YYYY-MM-DD"),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  source: z.enum(["direct", "widget"]).optional(),
  deviceType: z.enum(["mobile", "tablet", "desktop"]).optional(),
};

export function registerAnalyticsTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  const withToolErrors = withToolErrorsForContext(ctx);
  server.registerTool(
    "get_analytics_overview",
    {
      description:
        "Get aggregate views, conversions, time series, sources, and countries for this project. Requires Pro or Business.",
      inputSchema: commonInputShape,
    },
    withToolErrors(
      "get_analytics_overview",
      (input) => getAnalyticsOverview(ctx, input),
    ),
  );

  server.registerTool(
    "get_booking_funnel_analytics",
    {
      description:
        "Get UTC-backed clicked weekday and availability demand plus persisted booking-request weekday/time distributions in the required dashboard timezone. Pass a project-owned eventTypeId for exact unique-journey stages.",
      inputSchema: {
        ...commonInputShape,
        eventTypeId: z.string().optional(),
        timezone: z
          .string()
          .describe("IANA timezone used to group dates, weekdays, and times"),
      },
    },
    withToolErrors(
      "get_booking_funnel_analytics",
      (input) => getBookingFunnelAnalytics(ctx, input),
    ),
  );

  server.registerTool(
    "get_form_funnel_analytics",
    {
      description:
        "Get form analytics. Pass a project-owned formId for rendered stages, conditional skips, journey sources, and visitor devices.",
      inputSchema: {
        ...commonInputShape,
        formId: z.string().optional(),
      },
    },
    withToolErrors(
      "get_form_funnel_analytics",
      (input) => getFormFunnelAnalytics(ctx, input),
    ),
  );

  server.registerTool(
    "list_analytics_integrations",
    {
      description:
        "List GA4, Meta Pixel, and PostHog public analytics integration settings for this project. Requires Pro or Business.",
      inputSchema: {},
    },
    withToolErrors(
      "list_analytics_integrations",
      () => listAnalyticsIntegrations(ctx),
    ),
  );

  server.registerTool(
    "configure_analytics_integration",
    {
      description:
        "Configure one allowlisted analytics provider. Arbitrary scripts, URLs, and secrets are not accepted.",
      inputSchema: {
        provider: z.enum(["ga4", "meta_pixel", "posthog"]),
        enabled: z.boolean(),
        measurementId: z.string().optional(),
        pixelId: z.string().optional(),
        projectKey: z.string().optional(),
        host: z.enum(["us", "eu"]).optional(),
      },
    },
    withToolErrors(
      "configure_analytics_integration",
      (input) => configureAnalyticsIntegration(ctx, input),
    ),
  );
}
