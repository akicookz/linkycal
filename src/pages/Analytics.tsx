import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CircleAlert,
  Clock3,
  Eye,
  MousePointerClick,
  Percent,
  Globe,
  Loader,
  MonitorSmartphone,
  Route,
  Search,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  AnalyticsBreakdownCard,
  type AnalyticsBreakdownItem,
} from "@/components/analytics/AnalyticsBreakdownCard";
import { DetailedFunnel } from "@/components/analytics/DetailedFunnel";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import type {
  DetailedFunnelReport,
  FunnelContextValue,
  FunnelStageReport,
} from "../../shared/funnel-analytics";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverviewData {
  totals: { views: number; conversions: number; conversionRate: number; uniqueSources: number };
  timeSeries: Array<{ date: string; views: number; conversions: number }>;
  topSources: Array<{ source: string; views: number; conversions: number }>;
  topCountries: Array<{ country: string; views: number; conversions: number }>;
}

interface BookingsData extends DetailedFunnelReport {
  funnel: { pageViews: number; bookingsCreated: number; conversionRate: number };
  byEventType: Array<{ slug: string; views: number; bookings: number; rate: number }>;
  timeSeries: Array<{ date: string; views: number; bookings: number }>;
}

interface FormsData extends DetailedFunnelReport {
  funnel: { views: number; started: number; completed: number; startRate: number; completionRate: number };
  byForm: Array<{ slug: string; views: number; started: number; completed: number; completionRate: number }>;
  timeSeries: Array<{ date: string; views: number; started: number; completed: number }>;
}

interface FilterOptions {
  utmSources: string[];
  utmMediums: string[];
  utmCampaigns: string[];
  sources: string[];
  deviceTypes: string[];
  eventTypes: Array<{ id: string; slug: string; name: string }>;
  forms: Array<{ id: string; slug: string; name: string }>;
}

interface ProjectEntitlements {
  planLimits: {
    analytics: boolean;
  };
}

type Period = "7d" | "30d" | "90d" | "custom";
type AnalyticsTab = "overview" | "bookings" | "forms";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildQueryString(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v && v !== "all");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
}

function titleCaseAnalyticsValue(value: string): string {
  if (value === "none") return "No availability";
  const readable = value.replace(/_/g, " ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function contextItems(
  stages: FunnelStageReport[],
  key: keyof NonNullable<FunnelStageReport["contextBreakdowns"]>,
): AnalyticsBreakdownItem[] {
  const values = new Map<string, number>();
  for (const stage of stages) {
    const breakdown = stage.contextBreakdowns?.[key] as
      | FunnelContextValue[]
      | undefined;
    for (const item of breakdown ?? []) {
      values.set(item.value, (values.get(item.value) ?? 0) + item.visitors);
    }
  }
  return [...values.entries()].map(function toItem([label, value]) {
    return { label: titleCaseAnalyticsValue(label), value };
  });
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  suffix?: string;
}) {
  return (
    <Card className="rounded-[20px]">
      <CardContent className="px-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="w-9 h-9 rounded-[12px] bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
        <p className="text-2xl font-semibold mt-2">
          {typeof value === "number" ? formatNumber(value) : value}
          {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Funnel Bar ──────────────────────────────────────────────────────────────

function FunnelStep({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatNumber(value)} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Upgrade Prompt ──────────────────────────────────────────────────────────

function UpgradePrompt({ projectId }: { projectId: string }) {
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center justify-center py-40">
        <div className="w-16 h-16 rounded-[20px] bg-primary/10 flex items-center justify-center mb-6">
          <BarChart3 className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Unlock Analytics</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md mb-6">
          Get insights into your booking and form performance. Track page views,
          conversions, UTM sources, and more with detailed analytics.
        </p>
        <Button
          className="rounded-[16px] glow-surface"
          onClick={() => setShowUpgradeDialog(true)}
        >
          <Sparkles className="w-4 h-4" />
          Upgrade to Pro
        </Button>
      </div>
      <UpgradeDialog
        open={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        projectId={projectId}
        description="Analytics requires a Pro or Business plan."
      />
    </>
  );
}

// ─── Chart Wrapper ───────────────────────────────────────────────────────────

function TimeSeriesChart({
  data,
  lines,
}: {
  data: Array<Record<string, unknown>>;
  lines: Array<{ key: string; color: string; name: string }>;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        No data for this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          {lines.map((line) => (
            <linearGradient key={line.key} id={`grad-${line.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line.color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip
          labelFormatter={(label) => formatDate(String(label))}
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid hsl(var(--border))",
            backgroundColor: "hsl(var(--card))",
            fontSize: "13px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
          itemStyle={{ fontSize: "13px" }}
          cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "4 4" }}
        />
        {lines.map((line) => (
          <Area
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            fill={`url(#grad-${line.key})`}
            fillOpacity={1}
            name={line.name}
            activeDot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Breakdown Table ─────────────────────────────────────────────────────────

function BreakdownTable({
  rows,
  columns,
}: {
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string; format?: (v: unknown) => string }>;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No data yet</p>
    );
  }

  return (
    <div className="space-y-1">
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 rounded-[16px] bg-muted/50"
        >
          <span className="text-sm font-medium flex-1 truncate">
            {String(row[columns[0].key] || "—")}
          </span>
          {columns.slice(1).map((col) => (
            <span key={col.key} className="text-sm text-muted-foreground min-w-[60px] text-right">
              {col.format ? col.format(row[col.key]) : formatNumber(Number(row[col.key]))}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Detailed Funnel Report ─────────────────────────────────────────────────

function DetailedReportSection({
  data,
  resourceSelected,
  resourceLabel,
}: {
  data: DetailedFunnelReport;
  resourceSelected: boolean;
  resourceLabel: string;
}) {
  if (!resourceSelected) {
    return (
      <Card className="rounded-[20px]">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-[16px] bg-primary/10">
            <Route className="size-5 text-primary" />
          </div>
          <h3 className="text-balance text-sm font-semibold">
            Select a {resourceLabel} for exact step analytics
          </h3>
          <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
            The all-resources view keeps the high-level totals. Choose one{" "}
            {resourceLabel} to inspect question, availability, and submit
            drop-offs.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.stages.length === 0) {
    return (
      <Card className="rounded-[20px]">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-[16px] bg-muted">
            <Search className="size-5 text-muted-foreground" />
          </div>
          <h3 className="text-balance text-sm font-semibold">
            No detailed journeys in this period
          </h3>
          <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
            Try a wider date range or remove a traffic filter.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedDates = contextItems(data.stages, "selectedDates");
  const availabilityOutcomes = contextItems(
    data.stages,
    "availabilityOutcomes",
  );
  const offeredTimes = contextItems(data.stages, "offeredTimes");
  const selectedTimes = contextItems(data.stages, "selectedTimes");
  const validationFailures = contextItems(
    data.stages,
    "validationFailures",
  );
  const submitFailures = contextItems(data.stages, "submitFailures");

  return (
    <div className="space-y-6">
      <DetailedFunnel
        availableSince={data.availableSince}
        stages={data.stages}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnalyticsBreakdownCard
          title="Selected dates"
          icon={CalendarDays}
          items={selectedDates}
        />
        <AnalyticsBreakdownCard
          title="Availability outcomes"
          icon={CalendarRange}
          items={availabilityOutcomes}
        />
        <AnalyticsBreakdownCard
          title="Available times shown"
          icon={Clock3}
          items={offeredTimes}
        />
        <AnalyticsBreakdownCard
          title="Selected times"
          icon={MousePointerClick}
          items={selectedTimes}
        />
        <AnalyticsBreakdownCard
          title="Validation failures"
          icon={CircleAlert}
          items={validationFailures}
        />
        <AnalyticsBreakdownCard
          title="Submit failures"
          icon={CircleAlert}
          items={submitFailures}
        />
        <AnalyticsBreakdownCard
          title="Journey sources"
          icon={Globe}
          items={data.bySource.map(function sourceItem(item) {
            return {
              label: titleCaseAnalyticsValue(item.source),
              value: item.visitors,
            };
          })}
        />
        <AnalyticsBreakdownCard
          title="Visitor devices"
          icon={MonitorSmartphone}
          items={data.byDevice.map(function deviceItem(item) {
            return {
              label: titleCaseAnalyticsValue(item.deviceType),
              value: item.visitors,
            };
          })}
        />
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ projectId, period, filters }: { projectId: string; period: Period; filters: Record<string, string | undefined> }) {
  const qs = buildQueryString({ period, ...filters });
  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ["analytics-overview", projectId, period, filters],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/analytics/overview${qs}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) return <AnalyticsSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Views" value={data.totals.views} icon={Eye} />
        <StatCard label="Conversions" value={data.totals.conversions} icon={MousePointerClick} />
        <StatCard label="Conversion Rate" value={data.totals.conversionRate.toFixed(1)} icon={Percent} suffix="%" />
        <StatCard label="Unique Sources" value={data.totals.uniqueSources} icon={Globe} />
      </div>

      <Card className="rounded-[20px]">
        <CardContent>
          <h3 className="text-sm font-semibold mb-4">Views & Conversions</h3>
          <TimeSeriesChart
            data={data.timeSeries}
            lines={[
              { key: "views", color: "#1B4332", name: "Views" },
              { key: "conversions", color: "#2D6A4F", name: "Conversions" },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="rounded-[20px]">
          <CardContent>
            <h3 className="text-sm font-semibold mb-4">Top Sources</h3>
            <BreakdownTable
              rows={data.topSources}
              columns={[
                { key: "source", label: "Source" },
                { key: "views", label: "Views" },
                { key: "conversions", label: "Conv." },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="rounded-[20px]">
          <CardContent>
            <h3 className="text-sm font-semibold mb-4">Top Countries</h3>
            <BreakdownTable
              rows={data.topCountries}
              columns={[
                { key: "country", label: "Country" },
                { key: "views", label: "Views" },
                { key: "conversions", label: "Conv." },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Bookings Tab ────────────────────────────────────────────────────────────

function BookingsTab({
  projectId,
  period,
  filters,
  resourceSelected,
}: {
  projectId: string;
  period: Period;
  filters: Record<string, string | undefined>;
  resourceSelected: boolean;
}) {
  const qs = buildQueryString({ period, ...filters });
  const { data, isLoading } = useQuery<BookingsData>({
    queryKey: ["analytics-bookings", projectId, period, filters],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/analytics/bookings${qs}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) return <AnalyticsSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Page Views" value={data.funnel.pageViews} icon={Eye} />
        <StatCard label="Bookings Created" value={data.funnel.bookingsCreated} icon={MousePointerClick} />
        <StatCard label="Conversion Rate" value={data.funnel.conversionRate.toFixed(1)} icon={TrendingUp} suffix="%" />
      </div>

      <DetailedReportSection
        data={data}
        resourceSelected={resourceSelected}
        resourceLabel="event type"
      />

      <Card className="rounded-[20px]">
        <CardContent>
          <h3 className="text-sm font-semibold mb-4">Booking Funnel</h3>
          <div className="space-y-3">
            <FunnelStep label="Page Views" value={data.funnel.pageViews} total={data.funnel.pageViews} color="#1B4332" />
            <FunnelStep label="Bookings Created" value={data.funnel.bookingsCreated} total={data.funnel.pageViews} color="#2D6A4F" />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[20px]">
        <CardContent>
          <h3 className="text-sm font-semibold mb-4">Over Time</h3>
          <TimeSeriesChart
            data={data.timeSeries}
            lines={[
              { key: "views", color: "#1B4332", name: "Page Views" },
              { key: "bookings", color: "#2D6A4F", name: "Bookings" },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="rounded-[20px]">
        <CardContent>
          <h3 className="text-sm font-semibold mb-4">By Event Type</h3>
          <BreakdownTable
            rows={data.byEventType}
            columns={[
              { key: "slug", label: "Event Type" },
              { key: "views", label: "Views" },
              { key: "bookings", label: "Bookings" },
              { key: "rate", label: "Rate", format: (v) => `${Number(v).toFixed(1)}%` },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Forms Tab ───────────────────────────────────────────────────────────────

function FormsTab({
  projectId,
  period,
  filters,
  resourceSelected,
}: {
  projectId: string;
  period: Period;
  filters: Record<string, string | undefined>;
  resourceSelected: boolean;
}) {
  const qs = buildQueryString({ period, ...filters });
  const { data, isLoading } = useQuery<FormsData>({
    queryKey: ["analytics-forms", projectId, period, filters],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/analytics/forms${qs}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) return <AnalyticsSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Form Views" value={data.funnel.views} icon={Eye} />
        <StatCard label="Started" value={data.funnel.started} icon={MousePointerClick} />
        <StatCard label="Completed" value={data.funnel.completed} icon={TrendingUp} />
      </div>

      <DetailedReportSection
        data={data}
        resourceSelected={resourceSelected}
        resourceLabel="form"
      />

      <Card className="rounded-[20px]">
        <CardContent>
          <h3 className="text-sm font-semibold mb-4">Form Funnel</h3>
          <div className="space-y-3">
            <FunnelStep label="Form Views" value={data.funnel.views} total={data.funnel.views} color="#1B4332" />
            <FunnelStep label="Started" value={data.funnel.started} total={data.funnel.views} color="#2D6A4F" />
            <FunnelStep label="Completed" value={data.funnel.completed} total={data.funnel.views} color="#40916C" />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="rounded-[20px]">
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[12px] bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Start Rate</p>
                <p className="text-xl font-semibold">{data.funnel.startRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[20px]">
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[12px] bg-primary/10 flex items-center justify-center">
                <Percent className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-xl font-semibold">{data.funnel.completionRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[20px]">
        <CardContent>
          <h3 className="text-sm font-semibold mb-4">Over Time</h3>
          <TimeSeriesChart
            data={data.timeSeries}
            lines={[
              { key: "views", color: "#1B4332", name: "Views" },
              { key: "started", color: "#2D6A4F", name: "Started" },
              { key: "completed", color: "#40916C", name: "Completed" },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="rounded-[20px]">
        <CardContent>
          <h3 className="text-sm font-semibold mb-4">By Form</h3>
          <BreakdownTable
            rows={data.byForm}
            columns={[
              { key: "slug", label: "Form" },
              { key: "views", label: "Views" },
              { key: "started", label: "Started" },
              { key: "completed", label: "Completed" },
              { key: "completionRate", label: "Rate", format: (v) => `${Number(v).toFixed(1)}%` },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="rounded-[20px]">
            <CardContent className="py-4">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-[20px]">
        <CardContent className="py-4">
          <Skeleton className="h-[300px] w-full rounded-[12px]" />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function Analytics() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [period, setPeriod] = useState<Period>("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [eventTypeSlug, setEventTypeSlug] = useState<string | undefined>();
  const [formSlug, setFormSlug] = useState<string | undefined>();
  const [trafficSource, setTrafficSource] = useState<string | undefined>();
  const [deviceType, setDeviceType] = useState<string | undefined>();
  const [utmSource, setUtmSource] = useState<string | undefined>();
  const [utmMedium, setUtmMedium] = useState<string | undefined>();
  const [utmCampaign, setUtmCampaign] = useState<string | undefined>();

  const { data: entitlements, isLoading: entitlementsLoading } = useQuery<ProjectEntitlements>({
    queryKey: ["projects", projectId, "entitlements"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/entitlements`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!projectId,
  });

  const hasAccess = entitlements?.planLimits?.analytics === true;

  // Fetch filter options
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["analytics-filters", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/analytics/filters`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!hasAccess,
  });

  if (entitlementsLoading) {
    return (
      <>
        <PageHeader title="Analytics" description="Track performance across your bookings and forms" />
        <div className="flex items-center justify-center py-40">
          <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!hasAccess) {
    return (
      <>
        <PageHeader title="Analytics" description="Track performance across your bookings and forms" />
        <UpgradePrompt projectId={projectId!} />
      </>
    );
  }

  const filters = {
    utmSource,
    utmMedium,
    utmCampaign,
    source: trafficSource,
    deviceType,
    start: period === "custom" ? startDate || undefined : undefined,
    end: period === "custom" ? endDate || undefined : undefined,
  };
  const bookingFilters = {
    ...filters,
    resourceSlug: eventTypeSlug,
  };
  const formFilters = {
    ...filters,
    resourceSlug: formSlug,
  };

  return (
    <>
      <PageHeader title="Analytics" description="Track performance across your bookings and forms" />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AnalyticsTab)}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === "bookings" && filterOptions && (
              <Select
                value={eventTypeSlug ?? "all"}
                onValueChange={(value) =>
                  setEventTypeSlug(value === "all" ? undefined : value)
                }
              >
                <SelectTrigger
                  aria-label="Event type"
                  className="min-h-10 w-[180px]"
                >
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All event types</SelectItem>
                  {filterOptions.eventTypes.map(function eventTypeOption(option) {
                    return (
                      <SelectItem key={option.id} value={option.slug}>
                        {option.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            {activeTab === "forms" && filterOptions && (
              <Select
                value={formSlug ?? "all"}
                onValueChange={(value) =>
                  setFormSlug(value === "all" ? undefined : value)
                }
              >
                <SelectTrigger
                  aria-label="Form"
                  className="min-h-10 w-[180px]"
                >
                  <SelectValue placeholder="Form" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All forms</SelectItem>
                  {filterOptions.forms.map(function formOption(option) {
                    return (
                      <SelectItem key={option.id} value={option.slug}>
                        {option.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            <Select
              value={period}
              onValueChange={(value) => setPeriod(value as Period)}
            >
              <SelectTrigger aria-label="Period" className="min-h-10 w-[155px]">
                <span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
                  <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
                  <SelectValue className="truncate" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="custom">Custom dates</SelectItem>
              </SelectContent>
            </Select>

            {period === "custom" && (
              <>
                <label className="sr-only" htmlFor="analytics-start-date">
                  Start date
                </label>
                <input
                  id="analytics-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="min-h-10 rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
                <label className="sr-only" htmlFor="analytics-end-date">
                  End date
                </label>
                <input
                  id="analytics-end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="min-h-10 rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </>
            )}

            {filterOptions && filterOptions.sources.length > 0 && (
              <Select
                value={trafficSource ?? "all"}
                onValueChange={(value) =>
                  setTrafficSource(value === "all" ? undefined : value)
                }
              >
                <SelectTrigger
                  aria-label="Traffic source"
                  className="min-h-10 w-[160px]"
                >
                  <SelectValue placeholder="Traffic source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All traffic</SelectItem>
                  {filterOptions.sources.map(function sourceOption(source) {
                    return (
                      <SelectItem key={source} value={source}>
                        {titleCaseAnalyticsValue(source)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            {filterOptions && filterOptions.deviceTypes.length > 0 && (
              <Select
                value={deviceType ?? "all"}
                onValueChange={(value) =>
                  setDeviceType(value === "all" ? undefined : value)
                }
              >
                <SelectTrigger
                  aria-label="Device type"
                  className="min-h-10 w-[155px]"
                >
                  <SelectValue placeholder="Device type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  {filterOptions.deviceTypes.map(function deviceOption(device) {
                    return (
                      <SelectItem key={device} value={device}>
                        {titleCaseAnalyticsValue(device)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            {filterOptions && filterOptions.utmSources.length > 0 && (
              <Select value={utmSource ?? "all"} onValueChange={(v) => setUtmSource(v === "all" ? undefined : v)}>
                <SelectTrigger aria-label="UTM source" className="min-h-10 w-[160px]">
                  <SelectValue placeholder="UTM source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All UTM sources</SelectItem>
                  {filterOptions.utmSources.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {filterOptions && filterOptions.utmMediums.length > 0 && (
              <Select value={utmMedium ?? "all"} onValueChange={(v) => setUtmMedium(v === "all" ? undefined : v)}>
                <SelectTrigger aria-label="UTM medium" className="min-h-10 w-[160px]">
                  <SelectValue placeholder="UTM medium" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All mediums</SelectItem>
                  {filterOptions.utmMediums.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {filterOptions && filterOptions.utmCampaigns.length > 0 && (
              <Select value={utmCampaign ?? "all"} onValueChange={(v) => setUtmCampaign(v === "all" ? undefined : v)}>
                <SelectTrigger aria-label="UTM campaign" className="min-h-10 w-[160px]">
                  <SelectValue placeholder="UTM campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  {filterOptions.utmCampaigns.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab projectId={projectId!} period={period} filters={filters} />
        </TabsContent>

        <TabsContent value="bookings" className="mt-6">
          <BookingsTab
            projectId={projectId!}
            period={period}
            filters={bookingFilters}
            resourceSelected={!!eventTypeSlug}
          />
        </TabsContent>

        <TabsContent value="forms" className="mt-6">
          <FormsTab
            projectId={projectId!}
            period={period}
            filters={formFilters}
            resourceSelected={!!formSlug}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
