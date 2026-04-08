import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Eye,
  MousePointerClick,
  Percent,
  Globe,
  Loader,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

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
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverviewData {
  totals: { views: number; conversions: number; conversionRate: number; uniqueSources: number };
  timeSeries: Array<{ date: string; views: number; conversions: number }>;
  topSources: Array<{ source: string; views: number; conversions: number }>;
  topCountries: Array<{ country: string; views: number; conversions: number }>;
}

interface BookingsData {
  funnel: { pageViews: number; bookingsCreated: number; conversionRate: number };
  byEventType: Array<{ slug: string; views: number; bookings: number; rate: number }>;
  timeSeries: Array<{ date: string; views: number; bookings: number }>;
}

interface FormsData {
  funnel: { views: number; started: number; completed: number; startRate: number; completionRate: number };
  byForm: Array<{ slug: string; views: number; started: number; completed: number; completionRate: number }>;
  timeSeries: Array<{ date: string; views: number; started: number; completed: number }>;
}

interface FilterOptions {
  utmSources: string[];
  utmMediums: string[];
  utmCampaigns: string[];
}

type Period = "7d" | "30d" | "90d";

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
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Upgrade Prompt ──────────────────────────────────────────────────────────

function UpgradePrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-40">
      <div className="w-16 h-16 rounded-[20px] bg-primary/10 flex items-center justify-center mb-6">
        <BarChart3 className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Unlock Analytics</h2>
      <p className="text-muted-foreground text-sm text-center max-w-md mb-6">
        Get insights into your booking and form performance. Track page views,
        conversions, UTM sources, and more with detailed analytics.
      </p>
      <Link to="/app/account/billing">
        <Button className="rounded-[16px] glow-surface">
          <Sparkles className="w-4 h-4" />
          Upgrade to Pro
        </Button>
      </Link>
    </div>
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
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
        />
        <Tooltip
          labelFormatter={(label) => formatDate(String(label))}
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid hsl(var(--border))",
            backgroundColor: "hsl(var(--card))",
            fontSize: "13px",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "13px" }}
        />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color}
            name={line.name}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
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

function BookingsTab({ projectId, period, filters }: { projectId: string; period: Period; filters: Record<string, string | undefined> }) {
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

function FormsTab({ projectId, period, filters }: { projectId: string; period: Period; filters: Record<string, string | undefined> }) {
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
  const [period, setPeriod] = useState<Period>("30d");
  const [utmSource, setUtmSource] = useState<string | undefined>();
  const [utmMedium, setUtmMedium] = useState<string | undefined>();
  const [utmCampaign, setUtmCampaign] = useState<string | undefined>();

  // Check plan access
  const { data: subData, isLoading: subLoading } = useQuery<{ subscription: { plan: string; status: string }; planLimits: { analytics: boolean } }>({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const res = await fetch("/api/billing/subscription");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const hasAccess = subData?.planLimits?.analytics === true;

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

  if (subLoading) {
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
        <UpgradePrompt />
      </>
    );
  }

  const filters = { utmSource, utmMedium, utmCampaign };

  return (
    <>
      <PageHeader title="Analytics" description="Track performance across your bookings and forms" />


      {/* Tabs */}
      <Tabs defaultValue="overview" >
        <div className="flex items-center justify-between">

          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-3">
            {/* Period selector */}
            <div className="flex items-center rounded-[12px] bg-muted p-1 gap-0.5">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors",
                    period === p
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
                </button>
              ))}
            </div>

            {/* UTM Filters */}
            {filterOptions && filterOptions.utmSources.length > 0 && (
              <Select value={utmSource ?? "all"} onValueChange={(v) => setUtmSource(v === "all" ? undefined : v)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {filterOptions.utmSources.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {filterOptions && filterOptions.utmMediums.length > 0 && (
              <Select value={utmMedium ?? "all"} onValueChange={(v) => setUtmMedium(v === "all" ? undefined : v)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Medium" />
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
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  {filterOptions.utmCampaigns.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div >
        </div>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab projectId={projectId!} period={period} filters={filters} />
        </TabsContent>

        <TabsContent value="bookings" className="mt-6">
          <BookingsTab projectId={projectId!} period={period} filters={filters} />
        </TabsContent>

        <TabsContent value="forms" className="mt-6">
          <FormsTab projectId={projectId!} period={period} filters={filters} />
        </TabsContent>
      </Tabs >
    </>
  );
}
