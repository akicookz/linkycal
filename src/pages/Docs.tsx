import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Terminal,
  FileText,
  Calendar,
  Users,
  Blocks,
  Zap,
  Key,
  Monitor,
  ChevronRight,
  Copy,
  Check,
  Info,
  AlertTriangle,
  Lightbulb,
  Hash,
  Code2,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
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
    ],
  },
  {
    title: "Forms API",
    icon: FileText,
    children: [
      { id: "create-response", title: "Create Response" },
      { id: "submit-step", title: "Submit Step" },
      { id: "native-html-form", title: "Native HTML Form" },
      { id: "get-form-config", title: "Get Form Config" },
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

// ─── Inline Helpers ───────────────────────────────────────────────────────────

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
        "group relative flex items-center gap-2",
        level === "h2" && "text-2xl font-bold tracking-tight mt-14 mb-4 scroll-mt-24",
        level === "h3" && "text-lg font-semibold mt-10 mb-3 scroll-mt-24",
      )}
    >
      {children}
      <a
        href={`#${id}`}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        aria-label={`Link to ${id}`}
      >
        <Hash className="w-4 h-4" />
      </a>
    </Tag>
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
  const scrollHandlerRef = useRef<(() => void) | null>(null);

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
    scrollHandlerRef.current = handleScroll;
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Fixed Header ────────────────────────────────────────────────── */}
      <header className="fixed top-0 z-50 w-full bg-background/80 backdrop-blur-xl border-b border-border h-14">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between h-full">
          <div className="flex items-center gap-3">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <Logo size="md" />
            </Link>
            <span className="hidden sm:block text-sm text-muted-foreground">Documentation</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full h-8" asChild>
              <Link to="/">Back to site</Link>
            </Button>
            <Button size="sm" className="glow-surface rounded-full h-8" asChild>
              <Link to="/?show_auth=true">Get Started</Link>
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
                    <button
                      key={child.id}
                      onClick={() => scrollTo(child.id)}
                      className={cn(
                        "block w-full text-left px-3 py-1.5 text-[13px] rounded-[8px] transition-colors",
                        activeSection === child.id
                          ? "text-primary bg-primary/[0.06] font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                    >
                      {child.title}
                    </button>
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
              <li>
                Get your API key from <IC>Settings</IC> <ChevronRight className="w-3 h-3 inline" />{" "}
                <IC>API Keys</IC>
              </li>
              <li>Start making API calls</li>
            </ol>

            <CodeBlock title="Check available slots" language="bash">
{`# Check available slots
curl -H "Authorization: Bearer lc_live_your_api_key" \\
  "https://linkycal.com/api/v1/availability/your-project?date=2026-03-24&timezone=UTC&eventTypeSlug=consultation"`}
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
              All API responses follow a consistent JSON format. Errors include a descriptive{" "}
              <IC>error</IC> field.
            </Callout>

            {/* ════════════════════════════════════════════════════════════
                2. FORMS API
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="create-response" level="h2">
              Create Response
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>POST /api/v1/forms/:formSlug/responses?projectSlug=:projectSlug</IC>
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
                  description: "Your project's URL slug (query param)",
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
{`curl -X POST "https://linkycal.com/api/v1/forms/contact/responses?projectSlug=acme" \\
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
              <IC>PATCH /api/v1/forms/:formSlug/responses/:responseId/steps/:stepIndex</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Submit field values for a specific step. Steps must be submitted in order (0, 1, 2...).
              When the last step is submitted, the response is automatically marked as completed.
            </p>

            <PropTable
              props={[
                {
                  name: "fields",
                  type: "array",
                  required: true,
                  description: "Array of { fieldId, value } objects",
                },
              ]}
            />

            <CodeBlock title="Request" language="bash">
{`curl -X PATCH "https://linkycal.com/api/v1/forms/contact/responses/resp_a1b2c3d4/steps/0" \\
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

            <SectionHeading id="native-html-form" level="h2">
              Native HTML Form
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              <IC>POST /api/public/forms/:formSlug/submit</IC>
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Post a regular browser form directly to LinkyCal without any client-side JavaScript.
              LinkyCal returns a hosted thank-you page by default, or a redirect if you configure one
              in the form builder.
            </p>

            <CodeBlock title="HTML Form Action" language="html">
{`<form action="https://linkycal.com/api/public/forms/contact/submit" method="post">
  <input type="text" name="full_name" required />
  <input type="email" name="email" required />
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>`}
            </CodeBlock>

            <Callout type="tip">
              Use your form field IDs as the HTML input <IC>name</IC> values. You can get the exact
              IDs from the form builder or the generated form API prompt.
            </Callout>

            <Callout type="warning">
              Native HTML submissions do not support file inputs yet. Use the widget or JSON API flow
              if your form includes file upload fields.
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
{`curl -H "Authorization: Bearer lc_live_your_api_key" \\
  "https://linkycal.com/api/v1/availability/acme?date=2026-03-24&timezone=UTC&eventTypeSlug=consultation"`}
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
                  name: "phone",
                  type: "string",
                  required: false,
                  description: "Guest phone number",
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
                  required: false,
                  description: "Guest timezone (IANA format)",
                },
              ]}
            />

            <CodeBlock title="Request" language="bash">
{`curl -X POST "https://linkycal.com/api/v1/bookings" \\
  -H "Authorization: Bearer lc_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectSlug": "acme",
    "eventTypeSlug": "consultation",
    "startTime": "2026-03-24T09:00:00Z",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1-555-0123",
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
    "phone": "+1-555-0123",
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

            <Callout type="warning">
              This is a protected route requiring session authentication. It is not accessible via
              API key — use it from the dashboard or an authenticated session.
            </Callout>

            <CodeBlock title="Request" language="bash">
{`curl -X PATCH "https://linkycal.com/api/projects/proj_123/bookings/bk_abc123/cancel" \\
  -H "Cookie: session=your_session_cookie"`}
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
              Retrieve all contacts for a project, with optional search and tag filtering.
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
      "tags": ["lead", "vip"],
      "createdAt": "2026-03-20T10:00:00Z"
    }
  ]
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
  -H "Cookie: session=your_session_cookie" \\
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
  -H "Cookie: session=your_session_cookie" \\
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
                5. WIDGETS
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
                6. WORKFLOWS
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
                <span className="text-muted-foreground">Fires when a new booking is confirmed</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>booking_cancelled</IC>
                <span className="text-muted-foreground">Fires when a booking is cancelled</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>tag_added</IC>
                <span className="text-muted-foreground">Fires when a tag is added to a contact</span>
              </div>
              <div className="flex items-start gap-3 py-2">
                <IC>manual</IC>
                <span className="text-muted-foreground">Triggered manually via API</span>
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
              When a workflow's webhook action fires, it sends a POST request to your configured URL
              with a JSON payload describing the event.
            </p>

            <CodeBlock title="Webhook Payload" language="json">
{`{
  "event": "form_submitted",
  "timestamp": "2026-03-24T14:00:00Z",
  "data": {
    "formId": "form_x1y2z3",
    "responseId": "resp_a1b2c3d4",
    "contactId": "ct_m1n2o3"
  }
}`}
            </CodeBlock>

            {/* ════════════════════════════════════════════════════════════
                7. AUTHENTICATION
            ════════════════════════════════════════════════════════════ */}

            <SectionHeading id="api-keys" level="h2">
              API Keys
            </SectionHeading>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Create API keys in the dashboard under{" "}
              <IC>Settings</IC> <ChevronRight className="w-3 h-3 inline" /> <IC>API Keys</IC>.
              Include your key in the <IC>Authorization</IC> header as a Bearer token with every
              request.
            </p>

            <CodeBlock title="Authorization Header" language="bash">
{`curl -H "Authorization: Bearer lc_live_a1b2c3d4e5f6..." \\
  "https://linkycal.com/api/v1/availability/your-project?date=2026-03-24&eventTypeSlug=consultation"`}
            </CodeBlock>

            <Callout type="warning">
              API keys grant full access to your project. Never expose them in client-side code.
            </Callout>

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
              Rate limits apply to public API endpoints. Dashboard API endpoints have separate,
              higher limits.
            </Callout>

            {/* ════════════════════════════════════════════════════════════
                8. ADVANCED
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
              Currently, list endpoints return all results. Cursor-based pagination will be added in a
              future release with <IC>cursor</IC> and <IC>limit</IC> query parameters.
            </p>

            <Callout type="info">
              For now, all list endpoints return the full result set. Plan for pagination support if
              you're building against the Contacts API.
            </Callout>

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
                Get your API key and start building with LinkyCal's forms, booking, and contact
                APIs today.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button className="glow-surface rounded-full" asChild>
                  <Link to="/?show_auth=true">Get API Key</Link>
                </Button>
                <Button variant="outline" className="rounded-full" asChild>
                  <a href="https://github.com/linkycal" target="_blank" rel="noopener noreferrer">
                    View on GitHub
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
