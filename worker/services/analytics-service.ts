// ─── Analytics Service ────────────────────────────────────────────────────────
//
// Uses Cloudflare Workers Analytics Engine (WAE) for event tracking and queries.
//
// Data point blob layout:
//   blob1:  projectId
//   blob2:  canonical event name
//   blob3:  resource slug (eventTypeSlug or formSlug)
//   blob4:  utm_source
//   blob5:  utm_medium
//   blob6:  utm_campaign
//   blob7:  utm_term
//   blob8:  utm_content
//   blob9:  referrer
//   blob10: country
//   blob11: city
//   blob12: source (direct | widget)
//   blob13: bounded custom params and safe event context (JSON stringified)
//   blob14: anonymous journey ID
//   blob15: funnel type
//   blob16: stable stage key
//   blob17: stage label snapshot
//   blob18: stage kind
//   blob19: primary context value
//   blob20: device type
//
// double1: event weight
// double2: stage order
// double3: available slot count
// double4: days in advance
// double5: event duration in minutes
// ─────────────────────────────────────────────────────────────────────────────

import {
  ANALYTICS_FAILURE_CATEGORIES,
} from "../../shared/funnel-analytics";
import type {
  AnalyticsFailureCategory,
  AnalyticsDeviceType,
  AnalyticsEventName,
  AnalyticsSource,
  DetailedFunnelReport,
  FunnelEventContext,
  FunnelContextBreakdowns,
  FunnelContextValue,
  FunnelStageKind,
  FunnelStageReport,
  FunnelType,
} from "../../shared/funnel-analytics";

export interface TrackEventData {
  projectId: string;
  event: AnalyticsEventName;
  projectSlug?: string;
  resourceSlug?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  country?: string;
  city?: string;
  source?: AnalyticsSource;
  params?: Record<string, string>;
  journeyId?: string;
  funnelType?: FunnelType;
  stageKey?: string;
  stageLabel?: string;
  stageKind?: FunnelStageKind;
  primaryValue?: string;
  deviceType?: AnalyticsDeviceType;
  stageOrder?: number;
  slotCount?: number;
  daysAhead?: number;
  durationMinutes?: number;
  context?: FunnelEventContext;
}

export interface AnalyticsQueryParams {
  projectId: string;
  period: "7d" | "30d" | "90d" | "custom";
  start?: string; // ISO date
  end?: string; // ISO date
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  resourceSlug?: string;
  source?: AnalyticsSource;
  deviceType?: AnalyticsDeviceType;
  groupBy?:
    | "source"
    | "device"
    | "country"
    | "resource"
    | "utm_source"
    | "utm_medium"
    | "utm_campaign";
}

// ─── Write ───────────────────────────────────────────────────────────────────

export function writeAnalyticsEvent(
  analytics: AnalyticsEngineDataset,
  data: TrackEventData,
): void {
  const blobContext =
    data.context && data.params
      ? JSON.stringify({ context: data.context, params: data.params })
      : data.context
        ? JSON.stringify({ context: data.context })
        : data.params
          ? JSON.stringify(data.params)
          : "";

  analytics.writeDataPoint({
    indexes: [data.projectId],
    blobs: [
      data.projectId,
      data.event,
      data.resourceSlug ?? "",
      data.utmSource ?? "",
      data.utmMedium ?? "",
      data.utmCampaign ?? "",
      data.utmTerm ?? "",
      data.utmContent ?? "",
      data.referrer ?? "",
      data.country ?? "",
      data.city ?? "",
      data.source ?? "direct",
      blobContext,
      data.journeyId ?? "",
      data.funnelType ?? "",
      data.stageKey ?? "",
      data.stageLabel ?? "",
      data.stageKind ?? "",
      data.primaryValue ?? "",
      data.deviceType ?? "",
    ],
    doubles: [
      1,
      data.stageOrder ?? 0,
      data.slotCount ?? 0,
      data.daysAhead ?? 0,
      data.durationMinutes ?? 0,
    ],
  });
}

// ─── Query ───────────────────────────────────────────────────────────────────

function buildDateFilter(params: AnalyticsQueryParams): string {
  if (params.period === "custom" && params.start && params.end) {
    const endExclusive = new Date(`${params.end}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return `AND timestamp >= '${params.start}' AND timestamp < '${
      endExclusive.toISOString().slice(0, 10)
    }'`;
  }

  const days = params.period === "7d" ? 7 : params.period === "30d" ? 30 : 90;
  return `AND timestamp >= NOW() - INTERVAL '${days}' DAY`;
}

function buildFilters(params: AnalyticsQueryParams): string {
  let sql = `WHERE blob1 = '${escSql(params.projectId)}'`;
  sql += ` ${buildDateFilter(params)}`;

  if (params.utmSource) sql += ` AND blob4 = '${escSql(params.utmSource)}'`;
  if (params.utmMedium) sql += ` AND blob5 = '${escSql(params.utmMedium)}'`;
  if (params.utmCampaign) sql += ` AND blob6 = '${escSql(params.utmCampaign)}'`;
  if (params.resourceSlug) sql += ` AND blob3 = '${escSql(params.resourceSlug)}'`;
  if (params.source) sql += ` AND blob12 = '${escSql(params.source)}'`;
  if (params.deviceType) {
    sql += ` AND blob20 = '${escSql(params.deviceType)}'`;
  }

  return sql;
}

function escSql(val: string): string {
  return val.replace(/'/g, "''");
}

interface SqlApiResponse {
  data: Record<string, unknown>[];
  meta: unknown;
  rows: number;
}

export interface DetailedAnalyticsRow {
  timestamp: string;
  event: AnalyticsEventName;
  context: string;
  journeyId: string;
  funnelType: string;
  stageKey: string;
  stageLabel: string;
  stageKind: string;
  primaryValue: string;
  source: string;
  deviceType: string;
  stageOrder: number;
  slotCount: number;
  daysAhead: number;
  durationMinutes: number;
}

interface StageAccumulator {
  key: string;
  label: string;
  kind: string;
  order: number;
  visitors: Set<string>;
  presence: Set<string>;
  skipped: Set<string>;
  selectedDates: Map<string, Set<string>>;
  availabilityOutcomes: Map<string, Set<string>>;
  offeredTimes: Map<string, Set<string>>;
  selectedTimes: Map<string, Set<string>>;
  validationFailures: Map<string, Set<string>>;
  submitFailures: Map<string, Set<string>>;
}

const ANALYTICS_SOURCE_SET = new Set<string>(["direct", "widget"]);
const ANALYTICS_DEVICE_SET = new Set<string>([
  "mobile",
  "tablet",
  "desktop",
]);
const ANALYTICS_FAILURE_SET = new Set<string>(
  ANALYTICS_FAILURE_CATEGORIES,
);
const ANALYTICS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ANALYTICS_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function emptyDetailedFunnel(): DetailedFunnelReport {
  return {
    availableSince: null,
    stages: [],
    bySource: [],
    byDevice: [],
    failures: [],
  };
}

function createStageAccumulator(row: DetailedAnalyticsRow): StageAccumulator {
  return {
    key: row.stageKey,
    label: row.stageLabel,
    kind: row.stageKind,
    order: Number(row.stageOrder),
    visitors: new Set(),
    presence: new Set(),
    skipped: new Set(),
    selectedDates: new Map(),
    availabilityOutcomes: new Map(),
    offeredTimes: new Map(),
    selectedTimes: new Map(),
    validationFailures: new Map(),
    submitFailures: new Map(),
  };
}

function addJourneyValue(
  values: Map<string, Set<string>>,
  value: string,
  journeyId: string,
): void {
  const journeys = values.get(value) ?? new Set<string>();
  journeys.add(journeyId);
  values.set(value, journeys);
}

function breakdown(
  values: Map<string, Set<string>>,
): FunnelContextValue[] | undefined {
  if (values.size === 0) return undefined;
  return [...values.entries()]
    .map(function toBreakdown([value, journeys]) {
      return { value, visitors: journeys.size };
    })
    .sort(function sortBreakdown(left, right) {
      return right.visitors - left.visitors ||
        left.value.localeCompare(right.value);
    });
}

function safeContext(raw: string): FunnelEventContext {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("context" in parsed) ||
      !parsed.context ||
      typeof parsed.context !== "object"
    ) {
      return {};
    }
    const input = parsed.context as Record<string, unknown>;
    const result: FunnelEventContext = {};
    if (
      typeof input.selectedDate === "string" &&
      ANALYTICS_DATE_PATTERN.test(input.selectedDate)
    ) {
      result.selectedDate = input.selectedDate;
    }
    if (
      Array.isArray(input.offeredSlotStarts) &&
      input.offeredSlotStarts.length <= 48 &&
      input.offeredSlotStarts.every(function validTime(value) {
        return typeof value === "string" &&
          ANALYTICS_TIME_PATTERN.test(value);
      })
    ) {
      result.offeredSlotStarts = input.offeredSlotStarts as string[];
    }
    if (
      input.availabilityOutcome === "available" ||
      input.availabilityOutcome === "none" ||
      input.availabilityOutcome === "error"
    ) {
      result.availabilityOutcome = input.availabilityOutcome;
    }
    if (
      typeof input.selectedTime === "string" &&
      ANALYTICS_TIME_PATTERN.test(input.selectedTime)
    ) {
      result.selectedTime = input.selectedTime;
    }
    if (
      typeof input.failureCategory === "string" &&
      ANALYTICS_FAILURE_SET.has(input.failureCategory)
    ) {
      result.failureCategory =
        input.failureCategory as AnalyticsFailureCategory;
    }
    return result;
  } catch {
    return {};
  }
}

function stageBreakdowns(
  stage: StageAccumulator,
): FunnelContextBreakdowns | undefined {
  const result: FunnelContextBreakdowns = {
    selectedDates: breakdown(stage.selectedDates),
    availabilityOutcomes: breakdown(stage.availabilityOutcomes),
    offeredTimes: breakdown(stage.offeredTimes),
    selectedTimes: breakdown(stage.selectedTimes),
    validationFailures: breakdown(stage.validationFailures),
    submitFailures: breakdown(stage.submitFailures),
  };
  if (Object.values(result).every(function isEmpty(value) {
    return value === undefined;
  })) {
    return undefined;
  }
  return result;
}

export function aggregateDetailedFunnel(
  rows: DetailedAnalyticsRow[],
): DetailedFunnelReport {
  const stages = new Map<string, StageAccumulator>();
  const sourceJourneys = new Map<AnalyticsSource, Set<string>>();
  const deviceJourneys = new Map<AnalyticsDeviceType, Set<string>>();
  const failureJourneys = new Map<
    AnalyticsFailureCategory,
    Set<string>
  >();
  let availableSince: string | null = null;

  for (const row of rows) {
    const journeyId = String(row.journeyId ?? "");
    if (!journeyId) continue;
    const timestamp = String(row.timestamp ?? "");
    if (timestamp && (!availableSince || timestamp < availableSince)) {
      availableSince = timestamp;
    }

    if (ANALYTICS_SOURCE_SET.has(row.source)) {
      const source = row.source as AnalyticsSource;
      const journeys = sourceJourneys.get(source) ?? new Set<string>();
      journeys.add(journeyId);
      sourceJourneys.set(source, journeys);
    }
    if (ANALYTICS_DEVICE_SET.has(row.deviceType)) {
      const deviceType = row.deviceType as AnalyticsDeviceType;
      const journeys = deviceJourneys.get(deviceType) ?? new Set<string>();
      journeys.add(journeyId);
      deviceJourneys.set(deviceType, journeys);
    }

    const context = safeContext(String(row.context ?? ""));
    if (context.failureCategory) {
      const journeys =
        failureJourneys.get(context.failureCategory) ?? new Set<string>();
      journeys.add(journeyId);
      failureJourneys.set(context.failureCategory, journeys);
    }

    const stageKey = String(row.stageKey ?? "");
    const stageOrder = Number(row.stageOrder);
    if (
      !stageKey ||
      !Number.isInteger(stageOrder) ||
      stageOrder < 1 ||
      row.event === "form_started"
    ) {
      continue;
    }

    const stage = stages.get(stageKey) ?? createStageAccumulator(row);
    if (stageOrder < stage.order) stage.order = stageOrder;
    if (!stage.label && row.stageLabel) stage.label = row.stageLabel;
    if (!stage.kind && row.stageKind) stage.kind = row.stageKind;
    stage.presence.add(journeyId);
    if (row.event === "form_stage_skipped") {
      stage.skipped.add(journeyId);
    } else {
      stage.visitors.add(journeyId);
    }

    if (context.selectedDate) {
      addJourneyValue(
        stage.selectedDates,
        context.selectedDate,
        journeyId,
      );
    }
    if (context.availabilityOutcome) {
      addJourneyValue(
        stage.availabilityOutcomes,
        context.availabilityOutcome,
        journeyId,
      );
    }
    for (const time of context.offeredSlotStarts ?? []) {
      addJourneyValue(stage.offeredTimes, time, journeyId);
    }
    if (context.selectedTime) {
      addJourneyValue(stage.selectedTimes, context.selectedTime, journeyId);
    }
    if (
      row.event === "form_stage_validation_failed" &&
      context.failureCategory
    ) {
      addJourneyValue(
        stage.validationFailures,
        stage.label || stage.key,
        journeyId,
      );
    }
    if (
      (row.event === "booking_submit_failed" ||
        row.event === "form_submit_failed") &&
      context.failureCategory
    ) {
      addJourneyValue(
        stage.submitFailures,
        context.failureCategory,
        journeyId,
      );
    }
    stages.set(stageKey, stage);
  }

  const ordered = [...stages.values()].sort(function sortStages(left, right) {
    return left.order - right.order || left.key.localeCompare(right.key);
  });
  const stageReports: FunnelStageReport[] = ordered.map(
    function toStageReport(stage, index) {
      const next = ordered[index + 1];
      const continued = next
        ? [...stage.visitors].filter(function reachedNext(journeyId) {
            return next.presence.has(journeyId);
          }).length
        : stage.visitors.size;
      const visitors = stage.visitors.size;
      const dropOffs = Math.max(0, visitors - continued);
      const contextBreakdowns = stageBreakdowns(stage);
      return {
        key: stage.key,
        label: stage.label || stage.key,
        kind: stage.kind || "step",
        order: stage.order,
        visitors,
        continued,
        continuationRate: visitors > 0
          ? (continued / visitors) * 100
          : 0,
        dropOffs,
        dropOffRate: visitors > 0 ? (dropOffs / visitors) * 100 : 0,
        skipped: stage.skipped.size,
        ...(contextBreakdowns ? { contextBreakdowns } : {}),
      };
    },
  );

  return {
    availableSince,
    stages: stageReports,
    bySource: [...sourceJourneys.entries()]
      .map(function sourceCount([source, journeys]) {
        return { source, visitors: journeys.size };
      })
      .sort(function sortSources(left, right) {
        return right.visitors - left.visitors ||
          left.source.localeCompare(right.source);
      }),
    byDevice: [...deviceJourneys.entries()]
      .map(function deviceCount([deviceType, journeys]) {
        return { deviceType, visitors: journeys.size };
      })
      .sort(function sortDevices(left, right) {
        return right.visitors - left.visitors ||
          left.deviceType.localeCompare(right.deviceType);
      }),
    failures: ANALYTICS_FAILURE_CATEGORIES
      .filter(function hasFailures(category) {
        return failureJourneys.has(category);
      })
      .map(function failureCount(category) {
        return {
          category,
          count: failureJourneys.get(category)?.size ?? 0,
        };
      }),
  };
}

async function querySql(
  accountId: string,
  apiToken: string,
  sql: string,
): Promise<SqlApiResponse> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "text/plain",
      },
      body: sql,
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Analytics query failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function queryDetailedFunnel(
  accountId: string,
  apiToken: string,
  params: AnalyticsQueryParams,
  funnelType: FunnelType,
): Promise<DetailedFunnelReport> {
  const filters = buildFilters(params);
  const result = await querySql(accountId, apiToken, `
    SELECT
      timestamp,
      blob2 AS event,
      blob13 AS context,
      blob14 AS journeyId,
      blob15 AS funnelType,
      blob16 AS stageKey,
      blob17 AS stageLabel,
      blob18 AS stageKind,
      blob19 AS primaryValue,
      blob12 AS source,
      blob20 AS deviceType,
      double2 AS stageOrder,
      double3 AS slotCount,
      double4 AS daysAhead,
      double5 AS durationMinutes
    FROM linkycal_analytics
    ${filters}
    AND blob14 != ''
    AND blob15 = '${escSql(funnelType)}'
    ORDER BY timestamp ASC
    LIMIT 10000
  `);
  return aggregateDetailedFunnel(
    result.data as unknown as DetailedAnalyticsRow[],
  );
}

// ─── Overview Query ──────────────────────────────────────────────────────────

export async function queryOverview(
  accountId: string,
  apiToken: string,
  params: AnalyticsQueryParams,
): Promise<{
  totals: { views: number; conversions: number; conversionRate: number; uniqueSources: number };
  timeSeries: Array<{ date: string; views: number; conversions: number }>;
  topSources: Array<{ source: string; views: number; conversions: number }>;
  topCountries: Array<{ country: string; views: number; conversions: number }>;
}> {
  const filters = buildFilters(params);

  const [totalsRes, timeSeriesRes, sourcesRes, countriesRes] = await Promise.all([
    // Totals
    querySql(accountId, apiToken, `
      SELECT
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      GROUP BY blob2
    `),
    // Time series
    querySql(accountId, apiToken, `
      SELECT
        formatDateTime(timestamp, '%Y-%m-%d') AS date,
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob2 IN ('page_view', 'form_view', 'booking_created', 'form_completed')
      GROUP BY date, blob2
      ORDER BY date ASC
    `),
    // Top sources (utm_source)
    querySql(accountId, apiToken, `
      SELECT
        blob4 AS source,
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob4 != ''
      GROUP BY blob4, blob2
      ORDER BY count DESC
      LIMIT 50
    `),
    // Top countries
    querySql(accountId, apiToken, `
      SELECT
        blob10 AS country,
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob10 != ''
      GROUP BY blob10, blob2
      ORDER BY count DESC
      LIMIT 50
    `),
  ]);

  // Parse totals
  const eventCounts: Record<string, number> = {};
  for (const row of totalsRes.data) {
    eventCounts[row.event as string] = Number(row.count);
  }
  const views = (eventCounts["page_view"] ?? 0) + (eventCounts["form_view"] ?? 0);
  const conversions = (eventCounts["booking_created"] ?? 0) + (eventCounts["form_completed"] ?? 0);
  const conversionRate = views > 0 ? (conversions / views) * 100 : 0;

  // Count unique sources
  const uniqueSources = new Set(sourcesRes.data.map((r) => r.source as string)).size;

  // Parse time series
  const dateMap = new Map<string, { views: number; conversions: number }>();
  for (const row of timeSeriesRes.data) {
    const d = String(row.date);
    const entry = dateMap.get(d) ?? { views: 0, conversions: 0 };
    const event = row.event as string;
    const count = Number(row.count);
    if (event === "page_view" || event === "form_view") entry.views += count;
    else entry.conversions += count;
    dateMap.set(d, entry);
  }
  const timeSeries = [...dateMap.entries()]
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Parse top sources
  const sourceMap = new Map<string, { views: number; conversions: number }>();
  for (const row of sourcesRes.data) {
    const src = row.source as string;
    const entry = sourceMap.get(src) ?? { views: 0, conversions: 0 };
    const event = row.event as string;
    const count = Number(row.count);
    if (event === "page_view" || event === "form_view") entry.views += count;
    else entry.conversions += count;
    sourceMap.set(src, entry);
  }
  const topSources = [...sourceMap.entries()]
    .map(([source, vals]) => ({ source, ...vals }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Parse top countries
  const countryMap = new Map<string, { views: number; conversions: number }>();
  for (const row of countriesRes.data) {
    const country = row.country as string;
    const entry = countryMap.get(country) ?? { views: 0, conversions: 0 };
    const event = row.event as string;
    const count = Number(row.count);
    if (event === "page_view" || event === "form_view") entry.views += count;
    else entry.conversions += count;
    countryMap.set(country, entry);
  }
  const topCountries = [...countryMap.entries()]
    .map(([country, vals]) => ({ country, ...vals }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  return { totals: { views, conversions, conversionRate, uniqueSources }, timeSeries, topSources, topCountries };
}

// ─── Bookings Query ──────────────────────────────────────────────────────────

export async function queryBookings(
  accountId: string,
  apiToken: string,
  params: AnalyticsQueryParams,
): Promise<{
  funnel: { pageViews: number; bookingsCreated: number; conversionRate: number };
  byEventType: Array<{ slug: string; views: number; bookings: number; rate: number }>;
  timeSeries: Array<{ date: string; views: number; bookings: number }>;
} & DetailedFunnelReport> {
  const filters = buildFilters(params);

  const [funnelRes, byTypeRes, tsRes, detailed] = await Promise.all([
    querySql(accountId, apiToken, `
      SELECT
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob2 IN ('page_view', 'booking_created')
      GROUP BY blob2
    `),
    querySql(accountId, apiToken, `
      SELECT
        blob3 AS slug,
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob2 IN ('page_view', 'booking_created')
      AND blob3 != ''
      GROUP BY blob3, blob2
    `),
    querySql(accountId, apiToken, `
      SELECT
        formatDateTime(timestamp, '%Y-%m-%d') AS date,
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob2 IN ('page_view', 'booking_created')
      GROUP BY date, blob2
      ORDER BY date ASC
    `),
    params.resourceSlug
      ? queryDetailedFunnel(accountId, apiToken, params, "booking")
      : Promise.resolve(emptyDetailedFunnel()),
  ]);

  const eventCounts: Record<string, number> = {};
  for (const row of funnelRes.data) {
    eventCounts[row.event as string] = Number(row.count);
  }
  const pageViews = eventCounts["page_view"] ?? 0;
  const bookingsCreated = eventCounts["booking_created"] ?? 0;

  // By event type
  const slugMap = new Map<string, { views: number; bookings: number }>();
  for (const row of byTypeRes.data) {
    const slug = row.slug as string;
    const entry = slugMap.get(slug) ?? { views: 0, bookings: 0 };
    if ((row.event as string) === "page_view") entry.views += Number(row.count);
    else entry.bookings += Number(row.count);
    slugMap.set(slug, entry);
  }
  const byEventType = [...slugMap.entries()]
    .map(([slug, v]) => ({ slug, ...v, rate: v.views > 0 ? (v.bookings / v.views) * 100 : 0 }))
    .sort((a, b) => b.views - a.views);

  // Time series
  const dateMap = new Map<string, { views: number; bookings: number }>();
  for (const row of tsRes.data) {
    const d = String(row.date);
    const entry = dateMap.get(d) ?? { views: 0, bookings: 0 };
    if ((row.event as string) === "page_view") entry.views += Number(row.count);
    else entry.bookings += Number(row.count);
    dateMap.set(d, entry);
  }
  const timeSeries = [...dateMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    funnel: { pageViews, bookingsCreated, conversionRate: pageViews > 0 ? (bookingsCreated / pageViews) * 100 : 0 },
    byEventType,
    timeSeries,
    ...detailed,
  };
}

// ─── Forms Query ─────────────────────────────────────────────────────────────

export async function queryForms(
  accountId: string,
  apiToken: string,
  params: AnalyticsQueryParams,
): Promise<{
  funnel: { views: number; started: number; completed: number; startRate: number; completionRate: number };
  byForm: Array<{ slug: string; views: number; started: number; completed: number; completionRate: number }>;
  timeSeries: Array<{ date: string; views: number; started: number; completed: number }>;
} & DetailedFunnelReport> {
  const filters = buildFilters(params);

  const [funnelRes, byFormRes, tsRes, detailed] = await Promise.all([
    querySql(accountId, apiToken, `
      SELECT
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob2 IN ('form_view', 'form_started', 'form_completed')
      GROUP BY blob2
    `),
    querySql(accountId, apiToken, `
      SELECT
        blob3 AS slug,
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob2 IN ('form_view', 'form_started', 'form_completed')
      AND blob3 != ''
      GROUP BY blob3, blob2
    `),
    querySql(accountId, apiToken, `
      SELECT
        formatDateTime(timestamp, '%Y-%m-%d') AS date,
        blob2 AS event,
        SUM(_sample_interval) AS count
      FROM linkycal_analytics
      ${filters}
      AND blob2 IN ('form_view', 'form_started', 'form_completed')
      GROUP BY date, blob2
      ORDER BY date ASC
    `),
    params.resourceSlug
      ? queryDetailedFunnel(accountId, apiToken, params, "form")
      : Promise.resolve(emptyDetailedFunnel()),
  ]);

  const eventCounts: Record<string, number> = {};
  for (const row of funnelRes.data) {
    eventCounts[row.event as string] = Number(row.count);
  }
  const views = eventCounts["form_view"] ?? 0;
  const started = eventCounts["form_started"] ?? 0;
  const completed = eventCounts["form_completed"] ?? 0;

  // By form
  const slugMap = new Map<string, { views: number; started: number; completed: number }>();
  for (const row of byFormRes.data) {
    const slug = row.slug as string;
    const entry = slugMap.get(slug) ?? { views: 0, started: 0, completed: 0 };
    const event = row.event as string;
    const count = Number(row.count);
    if (event === "form_view") entry.views += count;
    else if (event === "form_started") entry.started += count;
    else entry.completed += count;
    slugMap.set(slug, entry);
  }
  const byForm = [...slugMap.entries()]
    .map(([slug, v]) => ({ slug, ...v, completionRate: v.started > 0 ? (v.completed / v.started) * 100 : 0 }))
    .sort((a, b) => b.views - a.views);

  // Time series
  const dateMap = new Map<string, { views: number; started: number; completed: number }>();
  for (const row of tsRes.data) {
    const d = String(row.date);
    const entry = dateMap.get(d) ?? { views: 0, started: 0, completed: 0 };
    const event = row.event as string;
    const count = Number(row.count);
    if (event === "form_view") entry.views += count;
    else if (event === "form_started") entry.started += count;
    else entry.completed += count;
    dateMap.set(d, entry);
  }
  const timeSeries = [...dateMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    funnel: {
      views,
      started,
      completed,
      startRate: views > 0 ? (started / views) * 100 : 0,
      completionRate: started > 0 ? (completed / started) * 100 : 0,
    },
    byForm,
    timeSeries,
    ...detailed,
  };
}

// ─── Filter Options Query ────────────────────────────────────────────────────

export async function queryFilterOptions(
  accountId: string,
  apiToken: string,
  projectId: string,
): Promise<{
  utmSources: string[];
  utmMediums: string[];
  utmCampaigns: string[];
  sources: AnalyticsSource[];
  deviceTypes: AnalyticsDeviceType[];
}> {
  const [srcRes, medRes, campRes, sourceRes, deviceRes] = await Promise.all([
    querySql(accountId, apiToken, `
      SELECT blob4 AS val FROM linkycal_analytics
      WHERE blob1 = '${escSql(projectId)}' AND blob4 != ''
      AND timestamp >= NOW() - INTERVAL '90' DAY
      GROUP BY blob4
      LIMIT 100
    `),
    querySql(accountId, apiToken, `
      SELECT blob5 AS val FROM linkycal_analytics
      WHERE blob1 = '${escSql(projectId)}' AND blob5 != ''
      AND timestamp >= NOW() - INTERVAL '90' DAY
      GROUP BY blob5
      LIMIT 100
    `),
    querySql(accountId, apiToken, `
      SELECT blob6 AS val FROM linkycal_analytics
      WHERE blob1 = '${escSql(projectId)}' AND blob6 != ''
      AND timestamp >= NOW() - INTERVAL '90' DAY
      GROUP BY blob6
      LIMIT 100
    `),
    querySql(accountId, apiToken, `
      SELECT blob12 AS val FROM linkycal_analytics
      WHERE blob1 = '${escSql(projectId)}' AND blob12 != ''
      AND timestamp >= NOW() - INTERVAL '90' DAY
      GROUP BY blob12
      LIMIT 10
    `),
    querySql(accountId, apiToken, `
      SELECT blob20 AS val FROM linkycal_analytics
      WHERE blob1 = '${escSql(projectId)}' AND blob20 != ''
      AND timestamp >= NOW() - INTERVAL '90' DAY
      GROUP BY blob20
      LIMIT 10
    `),
  ]);

  return {
    utmSources: srcRes.data.map((r) => r.val as string),
    utmMediums: medRes.data.map((r) => r.val as string),
    utmCampaigns: campRes.data.map((r) => r.val as string),
    sources: sourceRes.data
      .map((row) => String(row.val))
      .filter(function validSource(value): value is AnalyticsSource {
        return ANALYTICS_SOURCE_SET.has(value);
      }),
    deviceTypes: deviceRes.data
      .map((row) => String(row.val))
      .filter(function validDevice(value): value is AnalyticsDeviceType {
        return ANALYTICS_DEVICE_SET.has(value);
      }),
  };
}
