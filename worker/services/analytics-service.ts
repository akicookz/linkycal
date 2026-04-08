// ─── Analytics Service ────────────────────────────────────────────────────────
//
// Uses Cloudflare Workers Analytics Engine (WAE) for event tracking and queries.
//
// Data point blob layout:
//   blob1:  projectId
//   blob2:  event name (page_view, booking_created, form_view, form_started, form_completed)
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
//   blob13: custom params (JSON stringified)
//
// double1: 1 (unused — queries use _sample_interval for sampling-correct counts)
// ─────────────────────────────────────────────────────────────────────────────

export type AnalyticsEvent =
  | "page_view"
  | "booking_created"
  | "form_view"
  | "form_started"
  | "form_completed";

export interface TrackEventData {
  projectId: string;
  event: AnalyticsEvent;
  resourceSlug?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  country?: string;
  city?: string;
  source?: "direct" | "widget";
  params?: Record<string, string>;
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
  groupBy?: "source" | "country" | "resource" | "utm_source" | "utm_medium" | "utm_campaign";
}

// ─── Write ───────────────────────────────────────────────────────────────────

export function writeAnalyticsEvent(
  analytics: AnalyticsEngineDataset,
  data: TrackEventData,
): void {
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
      data.params ? JSON.stringify(data.params) : "",
    ],
    doubles: [1],
  });
}

// ─── Query ───────────────────────────────────────────────────────────────────

function buildDateFilter(params: AnalyticsQueryParams): string {
  if (params.period === "custom" && params.start && params.end) {
    return `AND timestamp >= '${params.start}' AND timestamp <= '${params.end}'`;
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
}> {
  const filters = buildFilters(params);

  const [funnelRes, byTypeRes, tsRes] = await Promise.all([
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
}> {
  const filters = buildFilters(params);

  const [funnelRes, byFormRes, tsRes] = await Promise.all([
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
}> {
  const [srcRes, medRes, campRes] = await Promise.all([
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
  ]);

  return {
    utmSources: srcRes.data.map((r) => r.val as string),
    utmMediums: medRes.data.map((r) => r.val as string),
    utmCampaigns: campRes.data.map((r) => r.val as string),
  };
}
