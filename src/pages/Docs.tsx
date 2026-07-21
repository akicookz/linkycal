import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Terminal,
  FileText,
  Calendar,
  Users,
  Blocks,
  Zap,
  Bot,
  Key,
  Monitor,
  Copy,
  Check,
  Info,
  AlertTriangle,
  Lightbulb,
  Hash,
  Code2,
  ArrowLeft,
  UserPlus,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import {
  API_REFERENCE_SECTIONS,
  type ApiReferenceMethod,
  type ApiReferenceSection,
} from "@/lib/api-reference";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SidebarSection {
  title: string;
  icon: React.ElementType;
  children: { id: string; title: string }[];
}

interface PropItem {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

// ─── Sidebar Config ───────────────────────────────────────────────────────────

const sidebarSections: SidebarSection[] = [
  {
    title: "Getting Started",
    icon: Terminal,
    children: [
      { id: "installation", title: "Installation" },
      { id: "quick-start", title: "Quick Start" },
      { id: "how-it-works", title: "How It Works" },
      { id: "api-families", title: "API Families" },
      { id: "endpoint-catalog", title: "Endpoint Catalog" },
      { id: "dashboard-only", title: "Dashboard-only" },
    ],
  },
  {
    title: "Forms API",
    icon: FileText,
    children: [
      { id: "create-response", title: "Create Response" },
      { id: "submit-step", title: "Submit Step" },
      { id: "upload-file", title: "Upload File" },
      { id: "native-html-form", title: "Native HTML Form" },
      { id: "get-form-config", title: "Get Form Config" },
      { id: "visitor-utility-api", title: "Other Visitor Routes" },
    ],
  },
  {
    title: "Booking API",
    icon: Calendar,
    children: [
      { id: "check-availability", title: "Check Availability" },
      { id: "create-booking", title: "Create Booking" },
      { id: "cancel-booking", title: "Cancel Booking" },
    ],
  },
  {
    title: "Contacts API",
    icon: Users,
    children: [
      { id: "list-contacts", title: "List Contacts" },
      { id: "create-contact", title: "Create Contact" },
      { id: "update-contact", title: "Update Contact" },
    ],
  },
  {
    title: "Management API",
    icon: Code2,
    children: API_REFERENCE_SECTIONS.map((section) => ({
      id: section.id,
      title: section.title,
    })),
  },
  {
    title: "Widgets",
    icon: Blocks,
    children: [
      { id: "booking-widget", title: "Booking Widget" },
      { id: "form-widget", title: "Form Widget" },
      { id: "widget-customization", title: "Customization" },
    ],
  },
  {
    title: "Workflows",
    icon: Zap,
    children: [
      { id: "triggers", title: "Triggers" },
      { id: "actions", title: "Actions" },
      { id: "webhook-events", title: "Webhook Events" },
    ],
  },
  {
    title: "MCP Server",
    icon: Bot,
    children: [
      { id: "mcp-overview", title: "Overview" },
      { id: "mcp-connect", title: "Connecting" },
      { id: "mcp-tools", title: "Available Tools" },
    ],
  },
  {
    title: "Authentication",
    icon: Key,
    children: [
      { id: "api-keys", title: "API Keys" },
      { id: "rate-limits", title: "Rate Limits" },
    ],
  },
  {
    title: "Advanced",
    icon: Monitor,
    children: [
      { id: "error-handling", title: "Error Handling" },
      { id: "pagination", title: "Pagination" },
      { id: "webhooks", title: "Webhooks" },
    ],
  },
];

// ─── Constants ──────────────────────────────────────────────────────────────

const MCP_CLIENT_CONFIG = `{
  "mcpServers": {
    "linkycal": {
      "type": "http",
      "url": "https://linkycal.com/api/mcp",
      "headers": {
        "Authorization": "Bearer lc_live_a1b2c3d4e5f6..."
      }
    }
  }
}`;

const API_MANAGEMENT_DOMAINS = [
  {
    id: "project-api",
    name: "Project settings",
    routes: "GET, PUT /api/projects/:projectId · GET /entitlements",
  },
  {
    id: "event-types-api",
    name: "Event types",
    routes: "List, get, create, update, delete, and configure calendars",
  },
  {
    id: "schedules-api",
    name: "Schedules and availability",
    routes: "Schedules, rules, and date overrides",
  },
  {
    id: "booking-management-api",
    name: "Bookings",
    routes: "List, get, cancel, confirm, decline, and read form responses",
  },
  {
    id: "form-management-api",
    name: "Forms and responses",
    routes: "Forms, steps, fields, responses, files, and reordering",
  },
  {
    id: "contact-management-api",
    name: "Contacts and views",
    routes: "Contacts, imports, next actions, stages, enrichment, and saved views",
  },
  {
    id: "tags-api",
    name: "Tags",
    routes: "Tag CRUD, cursor pagination, and idempotent contact assignments",
  },
  {
    id: "workflow-management-api",
    name: "Workflows",
    routes: "Definitions, steps, runs, manual triggers, and test runs",
  },
  {
    id: "analytics-activity-api",
    name: "Activity and analytics",
    routes: "Recent activity, filters, overview, booking analytics, and form analytics",
  },
  {
    id: "files-calendars-api",
    name: "Files and calendars",
    routes: "Project uploads, available calendars, and per-event-type calendar selection",
  },
];

const VISITOR_UTILITY_SECTION: ApiReferenceSection = {
  id: "visitor-utility-api",
  title: "Other visitor endpoints",
  description:
    "Supporting anonymous routes used by public links, widgets, analytics, and older form integrations.",
  notes: [
    "The /api/public form write routes are retained for compatibility. New direct integrations should use the equivalent /api/v1 form routes.",
    "Public upload URLs contain unguessable object keys; do not treat them as authorization for sensitive private response files.",
  ],
  operations: [
    { method: "GET", path: "/api/v1/event-types/:projectSlug/:eventSlug", description: "Get public event type configuration." },
    { method: "POST", path: "/api/v1/t", description: "Record an anonymous visitor analytics event." },
    { method: "GET", path: "/api/public/resolve/:projectSlug/:slug", description: "Resolve a share-link slug to a form or event type." },
    { method: "POST", path: "/api/public/forms/:projectSlug/:formSlug/responses", description: "Legacy form response creation." },
    { method: "PATCH", path: "/api/public/forms/:projectSlug/:formSlug/responses/:responseId/steps/:stepIndex", description: "Legacy form step submission." },
    { method: "POST", path: "/api/public/forms/:projectSlug/:formSlug/submit", description: "Legacy single-request form submission." },
    { method: "GET", path: "/api/uploads/:key", description: "Download a public upload by object key." },
  ],
};

// ─── Inline Helpers ───────────────────────────────────────────────────────────

function CopyActionButton({
  label,
  icon: Icon,
  getValue,
}: {
  label: string;
  icon: React.ElementType;
  getValue: () => string | Promise<string>;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(await getValue());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail silently.
    }
  }

  return (
    <Button variant="outline" size="sm" className="rounded-full h-10" onClick={handleCopy}>
      {copied ? <Check /> : <Icon />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function SectionHeading({
  id,
  level,
  children,
}: {
  id: string;
  level: "h2" | "h3";
  children: React.ReactNode;
}) {
  const Tag = level;
  return (
    <Tag
      id={id}
      className={cn(
        "relative scroll-mt-24 text-balance",
        level === "h2" && "text-2xl font-bold tracking-tight mt-14 mb-4",
        level === "h3" && "text-lg font-semibold mt-10 mb-3",
      )}
    >
      <a
        href={`#${id}`}
        className="group -ml-2 inline-flex min-h-10 items-center gap-2 rounded-[10px] px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Link to the ${id.replace(/-/g, " ")} section`}
      >
        <span>{children}</span>
        <Hash
          className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </a>
    </Tag>
  );
}

const METHOD_STYLES: Record<ApiReferenceMethod, string> = {
  GET: "bg-sky-500/10 text-sky-700",
  POST: "bg-emerald-500/10 text-emerald-700",
  PUT: "bg-amber-500/10 text-amber-700",
  PATCH: "bg-violet-500/10 text-violet-700",
  DELETE: "bg-rose-500/10 text-rose-700",
};

function ManagementReferenceSection({ section }: { section: ApiReferenceSection }) {
  return (
    <section aria-labelledby={section.id}>
      <SectionHeading id={section.id} level="h2">
        {section.title}
      </SectionHeading>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-4">
        {section.description}
      </p>
      <div className="space-y-2 my-4">
        {section.operations.map((operation) => (
          <div
            key={`${operation.method}-${operation.path}`}
            className="rounded-[16px] bg-muted/50 px-4 py-3 sm:flex sm:items-start sm:gap-3"
          >
            <span
              className={cn(
                "inline-flex w-16 shrink-0 justify-center rounded-[8px] px-2 py-1 font-mono text-[11px] font-semibold tabular-nums",
                METHOD_STYLES[operation.method],
              )}
            >
              {operation.method}
            </span>
            <div className="mt-2 min-w-0 sm:mt-0">
              <code className="block break-all text-[13px] text-foreground">
                {operation.path}
              </code>
              <p className="mt-1 text-xs leading-relaxed text-pretty text-muted-foreground">
                {operation.description}
              </p>
            </div>
          </div>
        ))}
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {section.notes.map((note) => (
          <li key={note} className="flex items-start gap-2 text-pretty">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
      {section.id === "contact-management-api" && <ContactManagementGuide />}
      {section.id === "tags-api" && <TagsApiGuide />}
    </section>
  );
}

function ContactManagementGuide() {
  return (
    <>
      <SectionHeading id="contact-list-filters" level="h3">
        Contact list filters
      </SectionHeading>
      <PropTable
        props={[
          { name: "search", type: "string", description: "Match contact name or email" },
          { name: "tagId", type: "string", description: "Legacy single-tag filter" },
          { name: "tagIds", type: "string[]", description: "Repeat the query key to filter by multiple tags" },
          { name: "matchAllTags", type: "boolean", description: "Require every tagIds value instead of any" },
          { name: "stageTagId", type: "string", description: "Require the current stage tag" },
          { name: "excludeStageTagIds", type: "string[]", description: "Repeated stage IDs to exclude" },
          { name: "activityType", type: "enum", description: "Filter by the latest supported activity type" },
          { name: "activitySinceDays", type: "number", description: "Require activity within this many days" },
          { name: "noActivitySinceDays", type: "number", description: "Require no activity within this many days" },
          { name: "bookingStatus", type: "enum", description: "Filter by related booking status" },
          { name: "limit", type: "integer", description: "Page size; defaults to 50 and is capped at 100" },
          { name: "offset", type: "integer", description: "Zero-based result offset" },
        ]}
      />

      <CodeBlock title="Filtered contact page" language="bash">
{`curl --get "https://linkycal.com/api/projects/proj_123/contacts" \\
  -H "Authorization: Bearer lc_live_your_api_key" \\
  --data-urlencode "tagIds=tag_lead" \\
  --data-urlencode "tagIds=tag_vip" \\
  --data-urlencode "matchAllTags=true" \\
  --data-urlencode "limit=50" \\
  --data-urlencode "offset=0"`}
      </CodeBlock>

      <SectionHeading id="contact-activity-pagination" level="h3">
        Contact activity pagination
      </SectionHeading>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-4">
        Activity accepts <IC>category</IC> values <IC>all</IC>, <IC>bookings</IC>,{" "}
        <IC>form_responses</IC>, or <IC>workflows</IC>. The default page size is 20 and the
        maximum is 100. Pass the returned opaque <IC>nextCursor</IC> unchanged to load the
        next page.
      </p>
      <CodeBlock title="Contact timeline page" language="bash">
{`curl --get "https://linkycal.com/api/projects/proj_123/contacts/ct_123/activities" \\
  -H "Authorization: Bearer lc_live_your_api_key" \\
  --data-urlencode "category=bookings" \\
  --data-urlencode "limit=20"`}
      </CodeBlock>
    </>
  );
}

function TagsApiGuide() {
  return (
    <>
      <SectionHeading id="tags-list-and-create" level="h3">
        List and create tags
      </SectionHeading>
      <PropTable
        props={[
          { name: "search", type: "string", description: "Case-insensitive name search, 1–100 characters" },
          { name: "limit", type: "integer", description: "Optional page size from 1 to 100" },
          { name: "cursor", type: "string", description: "Opaque nextCursor value; requires limit" },
          { name: "name", type: "string", required: true, description: "Trimmed project-unique name, 1–50 characters" },
          { name: "color", type: "string", description: "Optional six-digit hexadecimal color such as #1B4332" },
        ]}
      />
      <CodeBlock title="Create a tag" language="bash">
{`curl -X POST "https://linkycal.com/api/projects/proj_123/tags" \\
  -H "Authorization: Bearer lc_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Qualified lead","color":"#1B4332"}'`}
      </CodeBlock>
      <CodeBlock title="Paginated tag response" language="json">
{`{
  "tags": [
    {
      "id": "tag_123",
      "projectId": "proj_123",
      "name": "Qualified lead",
      "color": "#1B4332",
      "createdAt": "2026-07-22T09:00:00.000Z"
    }
  ],
  "nextCursor": null
}`}
      </CodeBlock>

      <SectionHeading id="tags-contact-assignment" level="h3">
        Assign and remove contact tags
      </SectionHeading>
      <CodeBlock title="Idempotent assignment" language="bash">
{`curl -X PUT \\
  "https://linkycal.com/api/projects/proj_123/contacts/ct_123/tags/tag_123" \\
  -H "Authorization: Bearer lc_live_your_api_key"`}
      </CodeBlock>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-4">
        Assignment returns <IC>{`{ tag, assigned }`}</IC>; removal returns{" "}
        <IC>{`{ success, tag, removed }`}</IC>. Repeating either request succeeds and reports{" "}
        <IC>false</IC> for the unchanged relationship.
      </p>
      <CodeBlock title="Deletion conflict" language="json">
{`{
  "error": "Tag is referenced by one or more workflows",
  "code": "TAG_IN_USE",
  "workflows": [{ "id": "wf_123", "name": "Research new leads" }]
}`}
      </CodeBlock>
    </>
  );
}

function CodeBlock({
  title,
  language,
  children,
}: {
  title?: string;
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group rounded-[16px] border border-border overflow-hidden my-4">
      {title && (
        <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{title}</span>
            {language && (
              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-[6px]">
                {language}
              </span>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded-[6px] hover:bg-muted"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      {!title && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded-[6px] hover:bg-white/10"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      <div className="code-block p-4 overflow-x-auto relative">
        <pre>
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}

function Callout({
  type,
  children,
}: {
  type: "info" | "warning" | "tip";
  children: React.ReactNode;
}) {
  const config = {
    info: { icon: Info, className: "callout-info", iconColor: "text-primary" },
    warning: { icon: AlertTriangle, className: "callout-warning", iconColor: "text-amber-600" },
    tip: { icon: Lightbulb, className: "callout-tip", iconColor: "text-emerald-600" },
  };

  const { icon: Icon, className, iconColor } = config[type];

  return (
    <div className={cn(className, "p-4 my-4 flex gap-3")}>
      <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", iconColor)} />
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function PropTable({ props }: { props: PropItem[] }) {
  return (
    <div className="rounded-[16px] border border-border overflow-hidden my-4">
      <div className="bg-muted/40 px-4 py-2.5 grid grid-cols-[140px_100px_1fr] sm:grid-cols-[140px_100px_80px_1fr] text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <span>Property</span>
        <span>Type</span>
        <span className="hidden sm:block">Required</span>
        <span>Description</span>
      </div>
      {props.map((prop) => (
        <div
          key={prop.name}
          className="px-4 py-3 border-t border-border text-sm grid grid-cols-[140px_100px_1fr] sm:grid-cols-[140px_100px_80px_1fr] items-start"
        >
          <span className="font-mono text-[13px] text-primary">{prop.name}</span>
          <span className="font-mono text-[13px] text-muted-foreground">{prop.type}</span>
          <span className="hidden sm:block text-muted-foreground">
            {prop.required ? "Yes" : "No"}
          </span>
          <span className="text-foreground">{prop.description}</span>
        </div>
      ))}
    </div>
  );
}

function IC({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted px-1.5 py-0.5 rounded-[6px] text-[13px] font-mono text-foreground">
      {children}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Docs() {
  const [activeSection, setActiveSection] = useState("installation");

  const handleScroll = useCallback(() => {
    const allIds = sidebarSections.flatMap((s) => s.children.map((c) => c.id));
    let current = allIds[0];

    for (const id of allIds) {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 120) {
          current = id;
        }
      }
    }

    setActiveSection(current);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const hashId = window.location.hash.slice(1);
      if (hashId) document.getElementById(hashId)?.scrollIntoView();
      handleScroll();
    });
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Docs"
        description="Explore LinkyCal API docs for forms, booking links, contacts, workflows, widgets, MCP tools, and authentication."
        canonical="https://linkycal.com/docs"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "LinkyCal API Documentation",
          description:
            "Technical documentation for LinkyCal forms, booking links, contacts, workflows, widgets, MCP tools, and authentication.",
          url: "https://linkycal.com/docs",
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": "https://linkycal.com/docs",
          },
          author: {
            "@type": "Organization",
            name: "LinkyCal",
            url: "https://linkycal.com/",
          },
          publisher: {
            "@type": "Organization",
            name: "LinkyCal",
            url: "https://linkycal.com/",
          },
        }}
      />

      {/* ── Fixed Header ────────────────────────────────────────────────── */}
      <header className="fixed top-0 z-50 w-full bg-background/80 backdrop-blur-xl border-b border-border h-14">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between h-full">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label="LinkyCal homepage"
              className="hover:opacity-80 transition-opacity"
            >
              <Logo size="md" />
            </Link>
            <span className="hidden sm:block text-sm text-muted-foreground">Documentation</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full h-8" asChild>
              <Link to="/">
                <ArrowLeft />
                LinkyCal home
              </Link>
            </Button>
            <Button size="sm" className="glow-surface rounded-full h-8" asChild>
              <Link to="/?show_auth=true">
                <UserPlus />
                Create a LinkyCal account
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto flex pt-14">
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto py-6 px-4 border-r border-border">
          {sidebarSections.map((section) => {
            const SIcon = section.icon;
            return (
              <div key={section.title}>
                <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-foreground">
                  <SIcon className="w-4 h-4 text-muted-foreground" />
                  {section.title}
                </div>
                <div className="ml-6 space-y-0.5 mb-3">
                  {section.children.map((child) => (
                    <a
                      key={child.id}
                      href={`#${child.id}`}
                      className={cn(
                        "flex min-h-10 w-full items-center px-3 py-2 text-left text-[13px] rounded-[8px] transition-colors",
                        activeSection === child.id
                          ? "text-primary bg-primary/[0.06] font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                    >
                      {child.title}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </aside>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 px-6 lg:px-12 py-10 pb-32">
          <div className="max-w-3xl">
            {/* ── Hero ──────────────────────────────────────────────── */}
            <div className="mb-10">
              <div className="bg-primary/[0.06] border border-primary/10 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm text-foreground">
                <Code2 className="w-4 h-4 text-primary" />
                Developer Documentation
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-4">
                LinkyCal API Documentation
              </h1>
              <p className="text-muted-foreground mt-3 text-lg leading-relaxed">
                Everything you need to integrate forms, booking, and contact management into your
                product.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-6">
                <CopyActionButton
                  label="MCP config"
                  icon={Bot}
                  getValue={() => MCP_CLIENT_CONFIG}
                />
                <CopyActionButton
                  label="Copy llms.txt"
                  icon={FileText}
                  getValue={() => "https://linkycal.com/llms.txt"}
                />
                <Button variant="outline" size="sm" className="rounded-full h-10" asChild>
                  <a href="/openapi.json">
                    <Code2 />
                    OpenAPI spec
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="rounded-full h-10" asChild>
                  <a href="/llms.txt">
                    <FileText />
                    View llms.txt
                  </a>
                </Button>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════
                1. GETTING STARTED
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="installation" level="h2">
              Installation
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              The fastest way to add LinkyCal to your site is with the embeddable widgets. Drop in a
              script tag and initialize with your project slug.
            </p>

            <CodeBlock title="Booking Widget" language="html">
{`<!-- Booking Widget -->
<script src="https://cdn.linkycal.com/widgets/booking.js"></script>
<script>
  LinkyCal.booking({
    projectSlug: "your-project",
    container: "#booking-widget"
  });
</script>`}
            </CodeBlock>

            <CodeBlock title="Form Widget" language="html">
{`<!-- Form Widget -->
<script src="https://cdn.linkycal.com/widgets/form.js"></script>
<script>
  LinkyCal.form({
    projectSlug: "your-project",
    formSlug: "contact",
    container: "#form-widget"
  });
</script>`}
            </CodeBlock>

            <SectionHeading id="quick-start" level="h2">
              Quick Start
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Get up and running in four steps:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-foreground mb-6">
              <li>Create a project in the dashboard</li>
              <li>Create an event type or form</li>
              <li>Use the anonymous visitor endpoints in your public form or booking UI</li>
              <li>
                For server-side management, create a project API key under <IC>MCP &amp; APIs</IC>
              </li>
            </ol>

            <CodeBlock title="Check available slots" language="bash">
{`# Check available slots
curl "https://linkycal.com/api/v1/availability/your-project?date=2026-08-12&timezone=UTC&eventTypeSlug=consultation"`}
            </CodeBlock>

            <SectionHeading id="how-it-works" level="h2">
              How It Works
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Every interaction with LinkyCal follows a straightforward request/response flow:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-foreground mb-6">
              <li>Client sends request to LinkyCal API</li>
              <li>Server validates input and checks availability/form config</li>
              <li>Action is performed (booking created, form step submitted, etc.)</li>
              <li>Response returned with result</li>
              <li>Optional: workflow triggers fire (email, webhook, tag)</li>
            </ol>

            <Callout type="info">
              JSON errors include a descriptive <IC>error</IC> field and may include a stable{" "}
              <IC>code</IC>. Successful responses vary by operation: JSON resources, file bodies,
              and empty <IC>204</IC> responses are all used where appropriate.
            </Callout>

            <SectionHeading id="api-families" level="h2">
              API Families
            </SectionHeading>
            <div className="space-y-2 my-4">
              <div className="rounded-[16px] bg-muted/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  Visitor API · <IC>/api/v1/*</IC>
                </p>
                <p className="text-xs text-muted-foreground text-pretty mt-1">
                  Canonical anonymous endpoints for availability, bookings, and multi-step form
                  submissions. These routes are safe for visitor-side code and are rate limited by
                  IP.
                </p>
              </div>
              <div className="rounded-[16px] bg-muted/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  Share-link API · <IC>/api/public/*</IC>
                </p>
                <p className="text-xs text-muted-foreground text-pretty mt-1">
                  Public link resolution and form configuration used by LinkyCal share pages. The
                  response-creation and step-submission variants are retained for compatibility;
                  new direct integrations should prefer <IC>/api/v1/*</IC>.
                </p>
              </div>
              <div className="rounded-[16px] bg-muted/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  Management API · <IC>/api/projects/:projectId/*</IC>
                </p>
                <p className="text-xs text-muted-foreground text-pretty mt-1">
                  Server-side project administration with a project-scoped API key. Never expose
                  this credential in a browser, widget, or public form.
                </p>
              </div>
            </div>

            <SectionHeading id="endpoint-catalog" level="h2">
              Endpoint Catalog
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-4">
              <strong className="text-foreground">Anonymous visitor endpoints</strong> cover form
              responses, file uploads, availability, booking creation, widgets, and public link
              resolution. They are rate limited and need no credential. Never put an API key in visitor-side code.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-4">
              The protected management API uses the canonical{" "}
              <IC>/api/projects/:projectId/*</IC> routes. Send{" "}
              <IC>Authorization: Bearer lc_live_...</IC> from a server, secure automation, or local
              agent. The key must belong to the project ID in the URL and the project must have API
              access on its current plan.
            </p>
            <div className="space-y-2 my-4">
              {API_MANAGEMENT_DOMAINS.map((domain) => (
                <a
                  key={domain.name}
                  href={`#${domain.id}`}
                  className="group flex min-h-10 items-start justify-between gap-3 rounded-[16px] bg-muted/50 px-4 py-3 transition-[background-color] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span>
                    <span className="block text-sm font-medium text-foreground">{domain.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground text-pretty">{domain.routes}</span>
                  </span>
                  <Hash className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </a>
              ))}
            </div>
            <Callout type="info">
              The complete machine-readable operation list and security declaration are in the{" "}
              <a href="/openapi.json" className="text-primary hover:underline">
                OpenAPI 3.1 specification
              </a>
              . Agent-oriented integration guidance is available in{" "}
              <a href="/llms.txt" className="text-primary hover:underline">
                llms.txt
              </a>
              .
            </Callout>

            <SectionHeading id="dashboard-only" level="h2">
              Dashboard-only Operations
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-4">
              Project creation and deletion, members, API-key management, billing, and OAuth connections are dashboard-only. Account, team, and onboarding operations are also
              session-only. API keys receive <IC>api_key_route_forbidden</IC> for these operations;
              use the dashboard instead.
            </p>

            {/* ════════════════════════════════════════════════════════════
                2. FORMS API
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="create-response" level="h2">
              Create Response
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>POST /api/v1/forms/:projectSlug/:formSlug/responses</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Start a new form response. Returns the response object and full form config including
              all steps and fields.
            </p>

            <PropTable
              props={[
                {
                  name: "projectSlug",
                  type: "string",
                  required: true,
                  description: "Your project's URL slug (path param)",
                },
                {
                  name: "formSlug",
                  type: "string",
                  required: true,
                  description: "The form's URL slug (path param)",
                },
              ]}
            />

            <CodeBlock title="Request" language="bash">
{`curl -X POST "https://linkycal.com/api/v1/forms/acme/contact/responses" \\
  -H "Content-Type: application/json"`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "response": {
    "id": "resp_a1b2c3d4",
    "formId": "form_x1y2z3",
    "currentStepIndex": 0,
    "status": "in_progress"
  },
  "form": {
    "id": "form_x1y2z3",
    "name": "Contact Form",
    "steps": [
      {
        "id": "step_1",
        "title": "Your Details",
        "fields": [
          { "id": "fld_1", "type": "text", "label": "Full Name", "required": true },
          { "id": "fld_2", "type": "email", "label": "Email", "required": true }
        ]
      }
    ]
  }
}`}
            </CodeBlock>

            <SectionHeading id="submit-step" level="h2">
              Submit Step
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>PATCH /api/v1/forms/:projectSlug/:formSlug/responses/:responseId/steps/:stepIndex</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Submit field values for a specific step. Steps must be submitted in order (0, 1, 2...).
              Pass <IC>complete: true</IC> on the final visible step to mark the response completed.
            </p>

            <PropTable
              props={[
                {
                  name: "fields",
                  type: "array",
                  required: true,
                  description: "Array of { fieldId, value } objects. File fields may include fileUrl from the upload endpoint.",
                },
                {
                  name: "complete",
                  type: "boolean",
                  required: false,
                  description: "Set true on the last visible step to finalize the response. Required for forms with conditional steps, where the server can't infer the final step from the index alone.",
                },
              ]}
            />

            <CodeBlock title="Request" language="bash">
{`curl -X PATCH "https://linkycal.com/api/v1/forms/acme/contact/responses/resp_a1b2c3d4/steps/0" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fields": [
      { "fieldId": "fld_1", "value": "Jane Smith" },
      { "fieldId": "fld_2", "value": "jane@example.com" }
    ]
  }'`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "response": {
    "id": "resp_a1b2c3d4",
    "status": "in_progress",
    "currentStepIndex": 1,
    "completedAt": null
  }
}`}
            </CodeBlock>

	            <Callout type="tip">
	              When the response status changes to <IC>completed</IC>, all steps have been submitted.
	            </Callout>

            <SectionHeading id="upload-file" level="h2">
              Upload File
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>POST /api/v1/forms/:projectSlug/:formSlug/responses/:responseId/uploads</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Upload a file for a file field before submitting that step through the JSON API.
              The upload response returns a private file pointer that you include as <IC>fileUrl</IC>.
            </p>

            <CodeBlock title="Upload request" language="bash">
{`curl -X POST "https://linkycal.com/api/v1/forms/acme/contact/responses/resp_a1b2c3d4/uploads" \\
  -F "fieldId=resume" \\
  -F "file=@./resume.pdf"`}
            </CodeBlock>

            <CodeBlock title="Submit uploaded file" language="bash">
{`curl -X PATCH "https://linkycal.com/api/v1/forms/acme/contact/responses/resp_a1b2c3d4/steps/0" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fields": [
      {
        "fieldId": "resume",
        "value": "resume.pdf",
        "fileUrl": "form-responses/project/form/response/resume/upload-id.pdf"
      }
    ]
  }'`}
            </CodeBlock>

            <Callout type="info">
              Uploaded respondent files are private by default. Dashboard users open them from the
              response drawer. API consumers can download them with a project API key at{" "}
              <IC>GET /api/v1/forms/:projectSlug/:formSlug/responses/:responseId/files/:valueId</IC>.
            </Callout>

            <SectionHeading id="native-html-form" level="h2">
              Native HTML Form
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>POST /api/public/forms/:projectSlug/:formSlug/submit</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Post a regular browser form directly to LinkyCal without any client-side JavaScript.
              LinkyCal returns a hosted thank-you page by default, or a redirect if you configure one
              in the form builder.
            </p>

            <CodeBlock title="HTML Form Action" language="html">
{`<form action="https://linkycal.com/api/public/forms/acme/contact/submit" method="post" enctype="multipart/form-data">
  <input type="text" name="full_name" required />
  <input type="email" name="email" required />
  <input type="file" name="resume" />
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>`}
            </CodeBlock>

	            <Callout type="tip">
	              Use your form field IDs as the HTML input <IC>name</IC> values. You can get the exact
	              IDs from the form builder or the generated form API prompt. Include{" "}
                <IC>enctype="multipart/form-data"</IC> when the form has file inputs.
	            </Callout>

            <SectionHeading id="get-form-config" level="h2">
              Get Form Config
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>GET /api/widget/form/:projectSlug/:formSlug/config</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Returns the full form structure with steps, fields, and validation rules. This is the
              same endpoint used internally by the form widget.
            </p>

            <CodeBlock title="Request" language="bash">
{`curl "https://linkycal.com/api/widget/form/acme/contact/config"`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "form": {
    "id": "form_x1y2z3",
    "name": "Contact Form",
    "slug": "contact",
    "steps": [
      {
        "id": "step_1",
        "title": "Your Details",
        "fields": [
          { "id": "fld_1", "type": "text", "label": "Full Name", "required": true },
          { "id": "fld_2", "type": "email", "label": "Email", "required": true },
          { "id": "fld_3", "type": "phone", "label": "Phone", "required": false }
        ]
      }
    ]
  }
}`}
            </CodeBlock>

            <ManagementReferenceSection section={VISITOR_UTILITY_SECTION} />

            {/* ════════════════════════════════════════════════════════════
                3. BOOKING API
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="check-availability" level="h2">
              Check Availability
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>GET /api/v1/availability/:projectSlug</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Returns available time slots for a given event type on a specific date. Use this to
              display available times to your users before creating a booking.
            </p>

            <PropTable
              props={[
                {
                  name: "date",
                  type: "string",
                  required: true,
                  description: "Date in YYYY-MM-DD format",
                },
                {
                  name: "timezone",
                  type: "string",
                  required: false,
                  description: "IANA timezone, defaults to UTC",
                },
                {
                  name: "eventTypeSlug",
                  type: "string",
                  required: true,
                  description: "The event type's URL slug",
                },
              ]}
            />

            <CodeBlock title="Request" language="bash">
{`curl "https://linkycal.com/api/v1/availability/acme?date=2026-08-12&timezone=UTC&eventTypeSlug=consultation"`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "slots": [
    { "start": "2026-03-24T09:00:00Z", "end": "2026-03-24T09:30:00Z" },
    { "start": "2026-03-24T10:00:00Z", "end": "2026-03-24T10:30:00Z" }
  ],
  "date": "2026-03-24",
  "timezone": "UTC"
}`}
            </CodeBlock>

            <SectionHeading id="create-booking" level="h2">
              Create Booking
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>POST /api/v1/bookings</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Create a new booking for an available time slot. The system validates slot availability
              before confirming. A confirmation email is automatically sent to the guest.
            </p>

            <PropTable
              props={[
                {
                  name: "projectSlug",
                  type: "string",
                  required: true,
                  description: "Your project's URL slug",
                },
                {
                  name: "eventTypeSlug",
                  type: "string",
                  required: true,
                  description: "The event type's URL slug",
                },
                {
                  name: "startTime",
                  type: "string",
                  required: true,
                  description: "ISO 8601 datetime",
                },
                {
                  name: "name",
                  type: "string",
                  required: true,
                  description: "Guest name",
                },
                {
                  name: "email",
                  type: "string",
                  required: true,
                  description: "Guest email",
                },
                {
                  name: "notes",
                  type: "string",
                  required: false,
                  description: "Additional notes from the guest",
                },
                {
                  name: "timezone",
                  type: "string",
                  required: true,
                  description: "Guest timezone (IANA format, e.g. America/New_York)",
                },
                {
                  name: "formFields",
                  type: "object",
                  required: false,
                  description: "Values for the event type's custom booking-form fields, keyed by field ID",
                },
              ]}
            />

            <CodeBlock title="Request" language="bash">
{`curl -X POST "https://linkycal.com/api/v1/bookings" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectSlug": "acme",
    "eventTypeSlug": "consultation",
    "startTime": "2026-03-24T09:00:00Z",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "notes": "Looking forward to our meeting",
    "timezone": "America/New_York"
  }'`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "booking": {
    "id": "bk_abc123",
    "eventTypeId": "et_xyz789",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "startTime": "2026-03-24T09:00:00Z",
    "endTime": "2026-03-24T09:30:00Z",
    "timezone": "America/New_York",
    "status": "confirmed",
    "notes": "Looking forward to our meeting",
    "createdAt": "2026-03-23T20:00:00Z"
  }
}`}
            </CodeBlock>

            <Callout type="info">
              A confirmation email is automatically sent to the guest. If Google Calendar is
              connected, an event is created.
            </Callout>

            <SectionHeading id="cancel-booking" level="h2">
              Cancel Booking
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>PATCH /api/projects/:projectId/bookings/:bookingId/cancel</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Cancel an existing booking. The booking status is set to{" "}
              <IC>cancelled</IC>. If connected to Google Calendar, the calendar event is also
              removed.
            </p>

            <Callout type="info">
              This protected project route accepts either a dashboard session or a project API key.
              Server-side integrations should use the Bearer header below.
            </Callout>

            <CodeBlock title="Request" language="bash">
{`curl -X PATCH "https://linkycal.com/api/projects/proj_123/bookings/bk_abc123/cancel" \\
  -H "Authorization: Bearer lc_live_your_api_key"`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "booking": {
    "id": "bk_abc123",
    "status": "cancelled",
    "cancelledAt": "2026-03-24T08:00:00Z"
  }
}`}
            </CodeBlock>

            {/* ════════════════════════════════════════════════════════════
                4. CONTACTS API
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="list-contacts" level="h2">
              List Contacts
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>GET /api/projects/:projectId/contacts</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Retrieve the first page of contacts for a project, with optional search and tag
              filtering. The response includes the full filtered <IC>total</IC>; see{" "}
              <a href="#contact-list-filters" className="text-primary hover:underline">
                Contact list filters
              </a>{" "}
              for the complete filter and pagination reference.
            </p>

            <PropTable
              props={[
                {
                  name: "search",
                  type: "string",
                  required: false,
                  description: "Search by name or email",
                },
                {
                  name: "tagId",
                  type: "string",
                  required: false,
                  description: "Filter by tag ID",
                },
                {
                  name: "limit",
                  type: "integer",
                  required: false,
                  description: "Page size, default 50 and maximum 100",
                },
                {
                  name: "offset",
                  type: "integer",
                  required: false,
                  description: "Zero-based result offset",
                },
              ]}
            />

            <CodeBlock title="Response" language="json">
{`{
  "contacts": [
    {
      "id": "ct_m1n2o3",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "+1-555-0123",
      "tags": [
        { "id": "tag_lead", "name": "Lead", "color": "#1B4332" }
      ],
      "lastActivityAt": "2026-07-22T08:30:00.000Z",
      "createdAt": "2026-03-20T10:00:00.000Z"
    }
  ],
  "total": 1
}`}
            </CodeBlock>

            <SectionHeading id="create-contact" level="h2">
              Create Contact
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>POST /api/projects/:projectId/contacts</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Create a new contact in your project. Contacts are also created automatically when a
              form is submitted or a booking is made.
            </p>

            <PropTable
              props={[
                {
                  name: "name",
                  type: "string",
                  required: true,
                  description: "Contact's full name",
                },
                {
                  name: "email",
                  type: "string",
                  required: false,
                  description: "Contact's email address",
                },
                {
                  name: "phone",
                  type: "string",
                  required: false,
                  description: "Contact's phone number",
                },
                {
                  name: "notes",
                  type: "string",
                  required: false,
                  description: "Internal notes about the contact",
                },
              ]}
            />

            <CodeBlock title="Request" language="bash">
{`curl -X POST "https://linkycal.com/api/projects/proj_123/contacts" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer lc_live_your_api_key" \\
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1-555-0123",
    "notes": "Met at conference"
  }'`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "contact": {
    "id": "ct_p4q5r6",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1-555-0123",
    "notes": "Met at conference",
    "createdAt": "2026-03-24T14:00:00Z"
  }
}`}
            </CodeBlock>

            <SectionHeading id="update-contact" level="h2">
              Update Contact
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>PUT /api/projects/:projectId/contacts/:contactId</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Update an existing contact's information. Only provided fields are updated.
            </p>

            <CodeBlock title="Request" language="bash">
{`curl -X PUT "https://linkycal.com/api/projects/proj_123/contacts/ct_p4q5r6" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer lc_live_your_api_key" \\
  -d '{
    "name": "Jane Smith-Doe",
    "notes": "Updated: now a paying customer"
  }'`}
            </CodeBlock>

            <CodeBlock title="Response" language="json">
{`{
  "contact": {
    "id": "ct_p4q5r6",
    "name": "Jane Smith-Doe",
    "email": "jane@example.com",
    "phone": "+1-555-0123",
    "notes": "Updated: now a paying customer",
    "updatedAt": "2026-03-24T15:00:00Z"
  }
}`}
            </CodeBlock>

            {/* ════════════════════════════════════════════════════════════
                5. MANAGEMENT API REFERENCE
            ════════════════════════════════════════════════════════════ */}

            {API_REFERENCE_SECTIONS.map((section) => (
              <ManagementReferenceSection key={section.id} section={section} />
            ))}

            {/* ════════════════════════════════════════════════════════════
                6. WIDGETS
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="booking-widget" level="h2">
              Booking Widget
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Embed a fully functional booking experience on any page. The widget handles event type
              selection, date/time picking, and form submission.
            </p>

            <CodeBlock title="Full Embed" language="html">
{`<div id="booking-widget"></div>
<script src="https://cdn.linkycal.com/widgets/booking.js"></script>
<script>
  LinkyCal.booking({
    projectSlug: "acme",
    container: "#booking-widget",
    eventTypeSlug: "consultation",
    theme: {
      primaryColor: "#1B4332"
    }
  });
</script>`}
            </CodeBlock>

            <PropTable
              props={[
                {
                  name: "projectSlug",
                  type: "string",
                  required: true,
                  description: "Your project's URL slug",
                },
                {
                  name: "container",
                  type: "string | HTMLElement",
                  required: true,
                  description: "CSS selector or DOM element",
                },
                {
                  name: "eventTypeSlug",
                  type: "string",
                  required: false,
                  description: "Skip event type selection",
                },
                {
                  name: "theme.primaryColor",
                  type: "string",
                  required: false,
                  description: "Override brand color",
                },
              ]}
            />

            <SectionHeading id="form-widget" level="h2">
              Form Widget
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Embed multi-step forms directly on your site. The widget renders each step in sequence
              and handles validation, submission, and completion state.
            </p>

            <CodeBlock title="Full Embed" language="html">
{`<div id="form-widget"></div>
<script src="https://cdn.linkycal.com/widgets/form.js"></script>
<script>
  LinkyCal.form({
    projectSlug: "acme",
    formSlug: "contact",
    container: "#form-widget",
    theme: {
      primaryColor: "#1B4332"
    }
  });
</script>`}
            </CodeBlock>

            <PropTable
              props={[
                {
                  name: "projectSlug",
                  type: "string",
                  required: true,
                  description: "Your project's URL slug",
                },
                {
                  name: "formSlug",
                  type: "string",
                  required: true,
                  description: "The form's URL slug",
                },
                {
                  name: "container",
                  type: "string | HTMLElement",
                  required: true,
                  description: "CSS selector or DOM element",
                },
                {
                  name: "theme.primaryColor",
                  type: "string",
                  required: false,
                  description: "Override brand color",
                },
              ]}
            />

            <SectionHeading id="widget-customization" level="h2">
              Customization
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Both widgets accept a <IC>theme</IC> object to match your brand. Override colors,
              border radius, and fonts.
            </p>

            <CodeBlock title="Theme Override" language="javascript">
{`LinkyCal.booking({
  projectSlug: "acme",
  container: "#booking-widget",
  theme: {
    primaryColor: "#1B4332",
    borderRadius: "12px",
    fontFamily: "Inter, sans-serif"
  }
});`}
            </CodeBlock>

            <Callout type="tip">
              Both widgets are zero-dependency IIFE bundles under 6KB gzipped.
            </Callout>

            {/* ════════════════════════════════════════════════════════════
                7. WORKFLOWS
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="triggers" level="h2">
              Triggers
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Workflows start with a trigger. When the trigger event occurs, all connected actions
              execute in sequence.
            </p>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex items-start gap-3 py-2">
                <IC>form_submitted</IC>
                <span className="text-muted-foreground">Fires when a form response is completed</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>booking_created</IC>
                <span className="text-muted-foreground">Fires whenever a new booking is created</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>booking_cancelled</IC>
                <span className="text-muted-foreground">Fires when a booking is cancelled</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>booking_pending</IC> / <IC>booking_confirmed</IC>
                <span className="text-muted-foreground">Fires for the corresponding booking state</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>new_contact_created</IC>
                <span className="text-muted-foreground">Fires when a brand-new contact is stored</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>tag_added</IC>
                <span className="text-muted-foreground">Fires when a tag is added to a contact</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>manual</IC>
                <span className="text-muted-foreground">Triggered manually via API</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>scheduled</IC>
                <span className="text-muted-foreground">Runs hourly, daily, weekly, or monthly in the configured timezone</span>
              </div>
            </div>

            <SectionHeading id="actions" level="h2">
              Actions
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Actions are the steps executed when a workflow is triggered. Chain multiple actions
              together with conditions and delays.
            </p>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex items-start gap-3 py-2">
                <IC>send_email</IC>
                <span className="text-muted-foreground">Send email via Resend</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>ai_research</IC>
                <span className="text-muted-foreground">Research and enrich a contact with structured results</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>add_tag</IC> / <IC>remove_tag</IC>
                <span className="text-muted-foreground">Modify contact tags</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>wait</IC>
                <span className="text-muted-foreground">Delay execution by a specified duration</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>condition</IC>
                <span className="text-muted-foreground">If/else branching based on contact data</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>webhook</IC>
                <span className="text-muted-foreground">HTTP request to an external URL</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>update_contact</IC>
                <span className="text-muted-foreground">Modify contact fields</span>
              </div>
            </div>

            <SectionHeading id="webhook-events" level="h2">
              Webhook Events
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              A webhook step sends the configured method, headers, and body to an external URL. The
              method defaults to <IC>POST</IC>; the body defaults to the workflow context below, but
              you can replace it and interpolate workflow values.
            </p>

            <CodeBlock title="Webhook Payload" language="json">
{`{
  "projectId": "proj_123",
  "contactId": "ct_m1n2o3",
  "contactEmail": "jane@example.com",
  "formResponseId": "resp_a1b2c3d4",
  "metadata": {}
}`}
            </CodeBlock>

            {/* ════════════════════════════════════════════════════════════
                8. MCP SERVER
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="mcp-overview" level="h2">
              MCP Server
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              LinkyCal ships a built-in{" "}
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Model Context Protocol
              </a>{" "}
              server, so AI agents can check availability, book meetings,
              manage contacts, and inspect forms on your behalf. It speaks
              Streamable HTTP at a single endpoint:
            </p>

            <CodeBlock title="MCP Endpoint" language="text">
              {`https://linkycal.com/api/mcp`}
            </CodeBlock>

            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              MCP connections authenticate with a project API key passed as a Bearer
              token. Every tool is hard-scoped to that key's project — agents
              never pass a project ID and can never reach data outside the
              project the key belongs to.
            </p>

            <SectionHeading id="mcp-connect" level="h2">
              Connecting
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Create an API key in the dashboard under <IC>MCP &amp; APIs</IC>,
              then register the server with your MCP client using the endpoint
              and authorization header below.
            </p>

            <CodeBlock title="MCP Client Config" language="json">
              {MCP_CLIENT_CONFIG}
            </CodeBlock>

            <Callout type="warning">
              The API key grants access to the MCP tools for its project. Configure it in
              server-side or local agent environments only — never ship it in client-side code.
              Project and key administration remain dashboard-only.
            </Callout>

            <Callout type="tip">
              Once connected, just ask in natural language: &ldquo;Book a
              30-minute demo with Sarah Chen next Tuesday at 2pm&rdquo; — the
              agent picks the right tools, checks availability, and confirms
              the booking.
            </Callout>

            <SectionHeading id="mcp-tools" level="h2">
              Available Tools
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              The server exposes 35 tools for the project, grouped by
              domain. Read tools return JSON; write tools enforce the same plan
              limits and validation as the dashboard.
            </p>

            <div className="rounded-[16px] border border-border overflow-hidden my-4">
              <div className="bg-muted/40 px-4 py-2.5 grid grid-cols-[130px_1fr] text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Domain</span>
                <span>Tools</span>
              </div>
              {[
                {
                  domain: "Bookings",
                  tools:
                    "list_bookings · get_booking · get_available_slots · create_booking · cancel_booking · confirm_booking · decline_booking",
                },
                {
                  domain: "Event Types",
                  tools:
                    "list_event_types · get_event_type · create_event_type · update_event_type",
                },
                {
                  domain: "Schedules",
                  tools: "list_schedules · get_schedule",
                },
                {
                  domain: "Contacts",
                  tools:
                    "list_contacts · get_contact · create_contact · update_contact · set_contact_next_action · complete_contact_next_action · delete_contact · get_contact_activity",
                },
                {
                  domain: "Tags",
                  tools:
                    "list_contact_tags · get_contact_tag · create_contact_tag · update_contact_tag · delete_contact_tag · add_tag_to_contact · remove_tag_from_contact",
                },
                {
                  domain: "Forms",
                  tools:
                    "list_forms · get_form · create_form · update_form · list_form_responses",
                },
                {
                  domain: "Workflows",
                  tools: "list_workflows · get_workflow",
                },
              ].map((row) => (
                <div
                  key={row.domain}
                  className="px-4 py-3 border-t border-border text-sm grid grid-cols-[130px_1fr] items-start"
                >
                  <span className="text-foreground font-medium">
                    {row.domain}
                  </span>
                  <span className="font-mono text-[13px] text-muted-foreground leading-relaxed">
                    {row.tools}
                  </span>
                </div>
              ))}
            </div>

            <Callout type="info">
              Workflows are read-only over MCP by design — agents can inspect
              automations but not modify them. Booking writes still trigger
              your workflows, emails, and calendar sync exactly like the API.
            </Callout>

            {/* ════════════════════════════════════════════════════════════
                9. AUTHENTICATION
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="api-keys" level="h2">
              API Keys
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Create API keys in the dashboard under <IC>MCP &amp; APIs</IC>.
              Include your key in the <IC>Authorization</IC> header as a Bearer token for MCP and
              protected <IC>/api/projects/:projectId/*</IC> requests. Visitor endpoints are
              anonymous and must not receive this header.
            </p>

            <CodeBlock title="Authorization Header" language="bash">
{`curl -H "Authorization: Bearer lc_live_a1b2c3d4e5f6..." \\
  "https://linkycal.com/api/projects/proj_123/contacts"`}
            </CodeBlock>

            <Callout type="warning">
              API keys are project-scoped management credentials. Keep them in server-side secret
              storage or a local agent configuration. Never expose them in visitor-side code.
            </Callout>

            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              API access is available on Pro and Business projects. Free projects return{" "}
              <IC>api_access_unavailable</IC> even when the key itself is valid. Read{" "}
              <IC>GET /api/projects/:projectId/entitlements</IC> when your integration needs the
              current resource limits.
            </p>

            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Send either a dashboard session or an API key, never both. If a request has a valid
              session plus any <IC>Authorization</IC> header, LinkyCal returns{" "}
              <IC>ambiguous_credentials</IC>. An invalid Bearer value returns{" "}
              <IC>invalid_api_key</IC> and never falls back to a session. A key used with another
              project returns <IC>api_key_project_mismatch</IC>; a project without current API
              entitlement returns <IC>api_access_unavailable</IC>.
            </p>

            <SectionHeading id="rate-limits" level="h2">
              Rate Limits
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              The API enforces per-IP rate limits to ensure fair usage. If you exceed the limit,
              you'll receive a <IC>429 Too Many Requests</IC> response.
            </p>

            <div className="rounded-[16px] border border-border overflow-hidden my-4">
              <div className="bg-muted/40 px-4 py-2.5 grid grid-cols-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Endpoint</span>
                <span>Limit</span>
              </div>
              {[
                { endpoint: "Availability checks", limit: "60 requests/minute per IP" },
                { endpoint: "Booking creation", limit: "10 requests/minute per IP" },
                { endpoint: "Form responses", limit: "30 requests/minute per IP" },
                { endpoint: "Form response uploads", limit: "30 requests/minute per IP" },
                { endpoint: "Form step submissions", limit: "60 requests/minute per IP" },
              ].map((row) => (
                <div
                  key={row.endpoint}
                  className="px-4 py-3 border-t border-border text-sm grid grid-cols-2"
                >
                  <span className="text-foreground">{row.endpoint}</span>
                  <span className="text-muted-foreground">{row.limit}</span>
                </div>
              ))}
            </div>

            <Callout type="info">
              These per-IP limits apply to visitor endpoints. Protected project requests are
              additionally constrained by project ownership, current plan, and resource limits.
            </Callout>

            {/* ════════════════════════════════════════════════════════════
                10. ADVANCED
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="error-handling" level="h2">
              Error Handling
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              All errors return a JSON object with a descriptive <IC>error</IC> field. Use the HTTP
              status code to determine the type of error.
            </p>

            <CodeBlock title="Error Response" language="json">
{`{
  "error": "Descriptive error message"
}`}
            </CodeBlock>

            <p className="text-muted-foreground text-sm leading-relaxed mb-2 mt-4">
              Common status codes:
            </p>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex items-start gap-3 py-1">
                <IC>400</IC>
                <span className="text-muted-foreground">Validation error — check your request body or parameters</span>
              </div>
              <div className="flex items-start gap-3 py-1">
                <IC>401</IC>
                <span className="text-muted-foreground">Unauthorized — missing or invalid API key</span>
              </div>
              <div className="flex items-start gap-3 py-1">
                <IC>403</IC>
                <span className="text-muted-foreground">Forbidden — plan limit reached or feature not available</span>
              </div>
              <div className="flex items-start gap-3 py-1">
                <IC>404</IC>
                <span className="text-muted-foreground">Not found — resource does not exist</span>
              </div>
              <div className="flex items-start gap-3 py-1">
                <IC>409</IC>
                <span className="text-muted-foreground">Conflict — a unique value already exists or a referenced resource cannot be deleted</span>
              </div>
              <div className="flex items-start gap-3 py-1">
                <IC>429</IC>
                <span className="text-muted-foreground">Rate limited — too many requests, try again later</span>
              </div>
              <div className="flex items-start gap-3 py-1">
                <IC>500</IC>
                <span className="text-muted-foreground">Server error — something went wrong on our end</span>
              </div>
            </div>

            <SectionHeading id="pagination" level="h2">
              Pagination
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Pagination is endpoint-specific. Do not assume that every list uses the same model.
            </p>
            <div className="space-y-2 my-4">
              <div className="rounded-[16px] bg-muted/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">Contacts</p>
                <p className="text-xs text-muted-foreground text-pretty mt-1">
                  Offset pagination with <IC>limit</IC> and <IC>offset</IC>. The default limit is 50,
                  the maximum is 100, and the response includes the full filtered <IC>total</IC>.
                </p>
              </div>
              <div className="rounded-[16px] bg-muted/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">Contact activity</p>
                <p className="text-xs text-muted-foreground text-pretty mt-1">
                  Cursor pagination with a default limit of 20 and maximum of 100. Pass the returned
                  opaque <IC>nextCursor</IC> unchanged.
                </p>
              </div>
              <div className="rounded-[16px] bg-muted/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">Tags</p>
                <p className="text-xs text-muted-foreground text-pretty mt-1">
                  Optional cursor pagination from 1 to 100 items. When using <IC>cursor</IC>, repeat
                  the same <IC>limit</IC> on the next request.
                </p>
              </div>
              <div className="rounded-[16px] bg-muted/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">Other lists</p>
                <p className="text-xs text-muted-foreground text-pretty mt-1">
                  Other list operations currently return their complete result unless their section
                  or OpenAPI operation declares a limit.
                </p>
              </div>
            </div>

            <SectionHeading id="webhooks" level="h2">
              Webhooks
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Configure webhooks via workflow actions to receive real-time notifications about events
              in your project. Create a workflow with a trigger (e.g. <IC>form_submitted</IC>) and
              add a <IC>webhook</IC> action pointing to your URL.
            </p>

            <CodeBlock title="Example: Workflow with Webhook" language="json">
{`{
  "trigger": "booking_created",
  "actions": [
    {
      "type": "webhook",
      "config": {
        "url": "https://your-app.com/webhooks/linkycal",
        "method": "POST",
        "headers": {
          "X-Webhook-Secret": "your_secret"
        }
      }
    }
  ]
}`}
            </CodeBlock>

            <Callout type="tip">
              Always verify webhook payloads using a shared secret to ensure requests originate from
              LinkyCal.
            </Callout>

            {/* ── Bottom CTA ──────────────────────────────────────────── */}
            <div className="rounded-[20px] border bg-card p-8 text-center mt-16">
              <Terminal className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="text-xl font-bold tracking-tight mb-2">Ready to integrate?</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
                Build visitor forms and booking flows without a secret, then use a project key for
                trusted management integrations.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button className="glow-surface rounded-full" asChild>
                  <Link to="/?show_auth=true">
                    <Key />
                    Create account for an API key
                  </Link>
                </Button>
                <Button variant="outline" className="rounded-full" asChild>
                  <a href="https://github.com/linkycal" target="_blank" rel="noopener noreferrer">
                    <Code2 />
                    View LinkyCal on GitHub
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
