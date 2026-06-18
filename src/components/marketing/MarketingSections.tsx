import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Braces,
  Briefcase,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  Code2,
  Database,
  FileText,
  Globe,
  Mail,
  Send,
  Shield,
  Sparkles,
  Tag,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketingCtaProps {
  onGetStarted: () => void;
}

/* ─── Shared: Section Heading ─────────────────────────────────────────────── */

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
}

function SectionHeading({
  title,
  subtitle,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        align === "center" ? "text-center mx-auto" : "text-left",
        "max-w-3xl",
        className,
      )}
    >
      <h2 className="font-heading text-[2.25rem] sm:text-[3rem] font-bold tracking-[-0.03em] leading-[1.05] text-foreground text-balance">
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            "text-base sm:text-lg text-muted-foreground leading-relaxed mt-5",
            align === "center" ? "max-w-xl mx-auto" : "max-w-xl",
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ─── Backend value: Three Feature Cards ────────────────────────────────────────── */

function StoredIllustration() {
  return (
    <div className="relative h-64 rounded-[20px] overflow-hidden bg-[linear-gradient(160deg,#E3F1E8_0%,#F1F7F3_55%,#EAF3EE_100%)]">
      {/* Inbound payload record */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[210px] bg-white rounded-[16px] p-4 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.4)]">
        <div className="flex items-center gap-2 mb-3.5">
          <div className="w-7 h-7 rounded-[9px] bg-brand/10 flex items-center justify-center shrink-0">
            <Database className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="h-[5px] w-20 rounded-full bg-[#D8E2DC]" />
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="h-[5px] w-10 rounded-full bg-[#E5EBE8]" />
            <div className="h-[5px] w-16 rounded-full bg-[#D8E2DC]" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-[5px] w-12 rounded-full bg-[#E5EBE8]" />
            <span className="text-[9px] text-foreground">sarah@acme.com</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="h-[5px] w-8 rounded-full bg-[#E5EBE8]" />
            <div className="h-[5px] w-14 rounded-full bg-[#D8E2DC]" />
          </div>
        </div>
      </div>
      {/* Spam blocked chip */}
      <div className="absolute top-5 right-5 flex items-center gap-1.5 bg-white rounded-full pl-1.5 pr-3 py-1.5 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.45)]">
        <div className="w-5 h-5 rounded-full bg-[#0F1A14] flex items-center justify-center">
          <Shield className="w-3 h-3 text-white" />
        </div>
        <span className="text-[10px] font-medium text-foreground">
          Spam blocked
        </span>
      </div>
      {/* Saved chip */}
      <div className="absolute bottom-5 left-5 flex items-center gap-1.5 bg-white rounded-full pl-1.5 pr-3 py-1.5 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.45)]">
        <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
        <span className="text-[10px] font-medium text-foreground">Saved</span>
      </div>
    </div>
  );
}

function EnrichIllustration() {
  return (
    <div className="relative h-64 rounded-[20px] overflow-hidden bg-[linear-gradient(160deg,#EFEAF8_0%,#F5F2FB_55%,#EAF3EE_100%)]">
      {/* Contact record */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] bg-white rounded-[18px] p-4 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.4)]">
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-brand" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-foreground leading-tight">
              Sarah Chen
            </div>
            <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">
              sarah@acme.com
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {[
            { Icon: Building2, value: "Acme Inc" },
            { Icon: Briefcase, value: "Head of Ops" },
            { Icon: Globe, value: "@sarahchen" },
          ].map((row) => (
            <div key={row.value} className="flex items-center gap-2">
              <row.Icon className="w-3 h-3 text-foreground/40 shrink-0" />
              <span className="text-[9.5px] text-foreground">{row.value}</span>
              <span className="ml-auto text-[8px] font-medium text-brand">
                added
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Enriched chip */}
      <div className="absolute top-5 right-5 flex items-center gap-1.5 bg-white rounded-full pl-1.5 pr-3 py-1.5 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.45)]">
        <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-white" />
        </div>
        <span className="text-[10px] font-medium text-foreground">Enriched</span>
      </div>
    </div>
  );
}

function ToolkitWorkflowIllustration() {
  return (
    <div className="relative h-64 rounded-[20px] overflow-hidden bg-[linear-gradient(160deg,#E8EFF7_0%,#F1F6F9_55%,#EAF4EE_100%)]">
      <div className="absolute inset-0 flex flex-col items-center justify-center px-10">
        {/* Trigger node */}
        <div className="w-full max-w-[220px] flex items-center gap-2.5 bg-white rounded-[14px] px-3.5 py-2.5 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.4)]">
          <div className="w-7 h-7 rounded-[9px] bg-brand/10 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-brand" />
          </div>
          <div>
            <div className="text-[8px] text-brand font-semibold uppercase tracking-wide leading-none">
              Trigger
            </div>
            <div className="text-[11px] font-medium text-foreground leading-tight mt-0.5">
              Form submitted
            </div>
          </div>
        </div>
        <div className="w-px h-5 bg-foreground/15" />
        {/* Action node */}
        <div className="w-full max-w-[220px] flex items-center gap-2.5 bg-white rounded-[14px] px-3.5 py-2.5 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.4)]">
          <div className="w-7 h-7 rounded-[9px] bg-[#3B82F6]/10 flex items-center justify-center shrink-0">
            <Mail className="w-3.5 h-3.5 text-[#3B82F6]" />
          </div>
          <span className="text-[11px] font-medium text-foreground">
            Send confirmation email
          </span>
        </div>
        <div className="w-px h-5 bg-foreground/15" />
        {/* Action node */}
        <div className="w-full max-w-[220px] flex items-center gap-2.5 bg-white rounded-[14px] px-3.5 py-2.5 shadow-[0_12px_30px_-18px_rgba(15,26,20,0.4)]">
          <div className="w-7 h-7 rounded-[9px] bg-[#8B5CF6]/10 flex items-center justify-center shrink-0">
            <Tag className="w-3.5 h-3.5 text-[#8B5CF6]" />
          </div>
          <span className="text-[11px] font-medium text-foreground">
            Add &ldquo;Lead&rdquo; tag
          </span>
        </div>
      </div>
    </div>
  );
}

const toolkitCards = [
  {
    title: "Stored & spam-filtered",
    description:
      "Every POST is validated, spam-checked, and saved. Nothing lost, no duplicates.",
    Illustration: StoredIllustration,
  },
  {
    title: "Enriched into a contact",
    description:
      "Each submission becomes a contact, auto-filled with company, role, and social profiles.",
    Illustration: EnrichIllustration,
  },
  {
    title: "Piped to your workflows",
    description:
      "Emails, tags, and webhooks fire the moment a form is submitted or a booking lands.",
    Illustration: ToolkitWorkflowIllustration,
  },
];

export function ToolkitSection() {
  return (
    <section id="features" className="relative scroll-mt-24 py-24 sm:py-28 px-6">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          title="You ship the frontend. We run the backend."
          subtitle="Point your forms and booking flows at LinkyCal. We store every submission, enrich it into a contact, and trigger the follow-up."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
          {toolkitCards.map((card) => (
            <div key={card.title} className="marketing-card p-3">
              <card.Illustration />
              <div className="px-4 pt-5 pb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {card.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {card.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Comparison: Without vs With LinkyCal ────────────────────────────────── */

const comparisonRows = [
  {
    before: "Waste credits and usage building custom forms",
    after: "Point your agent to LinkyCal's MCP server or LLMs.txt",
  },
  {
    before: "Deal with spam, configure captcha or Turnstile",
    after: "Spam filtered automatically",
  },
  {
    before: "Pay for an email provider and configure your domain",
    after: "New submission alerts goes out by default",
  },
  {
    before: "Research and enrich every lead by hand",
    after: "Leads enriched and tagged automatically",
  },
  {
    before: "Stand up a custom backend for emails and integrations",
    after: "Workflows to connect to your tools and services",
  },
];

export function ComparisonSection() {
  return (
    <section id="why" className="relative scroll-mt-24 py-24 sm:py-28 px-6">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          title="Spam-free forms without leaving chat"
          subtitle="A working form needs spam filtering, new submission alerts, storage, and a backend to glue it together. LinkyCal takes care of it all and then some."
        />
        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-0 mt-14">
          {/* Single vertical divider between the two timelines */}
          <span
            aria-hidden="true"
            className="hidden md:block absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/15"
          />
          {/* Before — Without LinkyCal (mirrored toward the divider on desktop) */}
          <div className="md:pr-20 md:text-right">
            <h3 className="text-xl font-semibold text-muted-foreground mb-8">
              Without LinkyCal
            </h3>
            <ol className="relative">
              {comparisonRows.map((row, i) => (
                <li
                  key={row.before}
                  className="relative flex items-start gap-4 pb-7 last:pb-0 md:flex-row-reverse"
                >
                  {i < comparisonRows.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-7 bottom-0 w-px bg-red-500/20 left-3 -translate-x-1/2 md:left-auto md:right-3 md:translate-x-1/2"
                    />
                  )}
                  <span className="relative mt-1 w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                    <X className="w-3 h-3 text-red-500/80" />
                  </span>
                  <span className="pt-1 text-lg text-muted-foreground leading-relaxed">
                    {row.before}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {/* After — With LinkyCal */}
          <div className="md:pl-20">
            <h3 className="text-xl font-semibold text-foreground mb-8">
              With LinkyCal
            </h3>
            <ol className="relative">
              {comparisonRows.map((row, i) => (
                <li
                  key={row.after}
                  className="relative flex items-start gap-4 pb-7 last:pb-0"
                >
                  {i < comparisonRows.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-3 -translate-x-1/2 top-7 bottom-0 w-px bg-brand/25"
                    />
                  )}
                  <span className="relative mt-1 w-6 h-6 rounded-full bg-brand flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                  <span className="pt-1 text-lg text-foreground leading-relaxed">
                    {row.after}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works: Numbered Steps + Screenshot ───────────────────────────── */

const showcaseSlides = [
  {
    src: "/screenshots/booking.webp",
    label: "Hosted booking pages",
    alt: "LinkyCal hosted booking page with date and time slot picker",
  },
  {
    src: "/screenshots/form-builder.webp",
    label: "Visual form builder",
    alt: "LinkyCal form builder editing a multi-step quote form",
  },
  {
    src: "/screenshots/workflows.webp",
    label: "Workflow automations",
    alt: "LinkyCal workflow templates triggered by forms and bookings",
  },
  {
    src: "/screenshots/contacts.webp",
    label: "Built-in contacts CRM",
    alt: "LinkyCal contacts list inside the dashboard",
  },
];

const SLIDE_INTERVAL = 4000;

function ShowcaseCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % showcaseSlides.length),
      SLIDE_INTERVAL,
    );
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div
      className="marketing-card p-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[4/3] rounded-[18px] overflow-hidden bg-white border border-border/40">
        {showcaseSlides.map((slide, i) => (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            loading="lazy"
            className={cn(
              "absolute inset-0 w-full h-full object-cover object-left-top transition-opacity duration-700",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between px-2 pt-3 pb-1">
        <span
          key={index}
          className="text-sm font-medium text-foreground animate-[fadeSlideIn_0.4s_ease-out]"
        >
          {showcaseSlides[index].label}
        </span>
        <div className="flex items-center gap-1.5">
          {showcaseSlides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              aria-label={`Show ${slide.label}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index
                  ? "w-5 bg-brand"
                  : "w-1.5 bg-brand/25 hover:bg-brand/45",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const workflowSteps = [
  {
    number: "01",
    title: "Create your project",
    description:
      "Pick a name and slug — it becomes your namespace for forms, event types, and contacts.",
  },
  {
    number: "02",
    title: "Build forms & event types",
    description:
      "Drag in fields, set availability rules, and brand everything to match your site.",
  },
  {
    number: "03",
    title: "Embed & go live",
    description:
      "Paste one script tag or share your hosted link. Submissions and bookings flow in instantly.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 py-24 sm:py-28 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-12 lg:gap-20 items-center">
        <div>
          <h2 className="font-heading text-[2.25rem] sm:text-[3rem] font-bold tracking-[-0.03em] leading-[1.05] text-foreground mb-12">
            Up and running in minutes
          </h2>
          <div className="space-y-9">
            {workflowSteps.map((step) => (
              <div key={step.number} className="flex gap-5">
                <div className="w-11 h-11 rounded-[14px] bg-[#F3F6F4] flex items-center justify-center text-sm font-bold text-foreground shrink-0 tabular-nums">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1.5">
                    {step.title}
                  </h3>
                  <p className="text-[15px] text-muted-foreground leading-relaxed max-w-md">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="marketing-panel p-5 sm:p-9">
          <ShowcaseCarousel />
          <div className="flex items-center justify-center gap-3 pt-6 pb-1">
            <span className="text-sm font-medium text-foreground">
              Embeds anywhere — WordPress, Webflow & plain HTML
            </span>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                <Code2 className="w-4 h-4 text-foreground" />
              </div>
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                <Globe className="w-4 h-4 text-foreground" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Integrations ────────────────────────────────────────────────────────── */

function GoogleCalendarTile() {
  return (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="3"
        fill="#fff"
        stroke="#E0E0E0"
        strokeWidth="1"
      />
      <rect x="3" y="4" width="18" height="6" rx="3" fill="#4285F4" />
      <path
        d="M8 2.5v3M16 2.5v3"
        stroke="#4285F4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <text
        x="12"
        y="18.5"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="#4285F4"
      >
        31
      </text>
    </svg>
  );
}

interface IntegrationTile {
  label: string;
  bg: string;
  custom?: boolean;
  Icon?: LucideIcon;
}

const integrationTiles: IntegrationTile[] = [
  { label: "Google Calendar", bg: "bg-white border border-border/60", custom: true },
  { label: "Email notifications", bg: "bg-[#3B82F6]", Icon: Mail },
  { label: "Webhooks", bg: "bg-[#101828]", Icon: Globe },
  { label: "Automations", bg: "bg-[#F59E0B]", Icon: Zap },
  { label: "Telegram agents", bg: "bg-[#4EA4F6]", Icon: Send },
  { label: "REST API", bg: "bg-[#1B4332]", Icon: Code2 },
  { label: "MCP for AI agents", bg: "bg-[#0F1A14]", Icon: Sparkles },
  { label: "CSV import", bg: "bg-[#8B5CF6]", Icon: FileText },
  { label: "Contacts CRM", bg: "bg-[#0E7490]", Icon: Users },
  { label: "Embeddable widgets", bg: "bg-[#EC4899]", Icon: Tag },
];

export function IntegrationsSection() {
  return (
    <section className="relative py-24 sm:py-28 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* Icon cluster */}
        <div className="marketing-panel relative overflow-hidden p-10 sm:p-14">
          <div className="grid grid-cols-5 gap-4 sm:gap-5 max-w-md mx-auto">
            {integrationTiles.map((tile) => (
              <div
                key={tile.label}
                title={tile.label}
                className={cn(
                  "aspect-square rounded-[18px] flex items-center justify-center shadow-[0_14px_30px_-18px_rgba(15,26,20,0.4)]",
                  tile.bg,
                )}
              >
                {tile.custom ? (
                  <GoogleCalendarTile />
                ) : (
                  tile.Icon && <tile.Icon className="w-6 h-6 text-white" />
                )}
              </div>
            ))}
          </div>
          {/* Converging connector lines */}
          <svg
            aria-hidden="true"
            viewBox="0 0 400 120"
            className="w-full max-w-md mx-auto mt-2 block"
            fill="none"
          >
            <path
              d="M40 0 C 60 80, 180 60, 200 120 M120 0 C 130 70, 190 60, 200 120 M200 0 V120 M280 0 C 270 70, 210 60, 200 120 M360 0 C 340 80, 220 60, 200 120"
              stroke="#1B4332"
              strokeOpacity="0.18"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        <div>
          <SectionHeading
            align="left"
            title="One backend, unlimited integrations"
          />
          <Link
            to="/docs"
            className="marketing-pill-dark h-12 px-7 gap-2 text-sm font-medium mt-8"
          >
            <BookOpen className="w-4 h-4" />
            View documentation
          </Link>
          <p className="text-lg text-foreground/80 leading-relaxed mt-10 max-w-lg">
            &ldquo;Connect your calendar, pipe every submission anywhere with
            webhooks, and let AI agents check availability and book through the
            built-in MCP server — seamlessly and efficiently.&rdquo;
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Headless / Developers ───────────────────────────────────────────────── */

export const HEADLESS_HTML_SNIPPET = `<!-- Native HTML, no JavaScript, no server -->
<form
  action="https://linkycal.com/api/public/forms/acme/contact/submit"
  method="post">
  <input name="full_name" placeholder="Your name" />
  <input name="email" type="email" placeholder="Email" />
  <button type="submit">Send</button>
</form>`;

const HEADLESS_JS_SNIPPET = `// Submit from React, Vue, or vanilla JS
const form = document.querySelector("form")

await fetch(
  "https://linkycal.com/api/public/forms/acme/contact/submit",
  { method: "POST", body: new FormData(form) }
)
// stored, spam-checked & piped to your workflows`;

const HEADLESS_SCHED_SNIPPET = `# Check open slots, no UI required
curl "https://linkycal.com/api/v1/availability/acme\\
?eventTypeSlug=intro-call&date=2026-07-01&timezone=UTC"

# Book one
curl -X POST https://linkycal.com/api/v1/bookings \\
  -d '{ "projectSlug":"acme","eventTypeSlug":"intro-call",
        "name":"Sarah Chen","email":"sarah@acme.com",
        "startTime":"2026-07-01T14:00:00Z" }'`;

interface HeadlessMode {
  id: string;
  label: string;
  file: string;
  Icon: LucideIcon;
  blurb: string;
  code: string;
}

const headlessModes: HeadlessMode[] = [
  {
    id: "html",
    label: "Native HTML forms",
    file: "contact-form.html",
    Icon: Code2,
    blurb:
      "Point a plain <form action> at your endpoint and POST. No JavaScript, no server code.",
    code: HEADLESS_HTML_SNIPPET,
  },
  {
    id: "js",
    label: "JavaScript & frameworks",
    file: "submit.js",
    Icon: Braces,
    blurb:
      "Submit with one fetch from React, Vue, or vanilla JS and keep your own UI and validation.",
    code: HEADLESS_JS_SNIPPET,
  },
  {
    id: "scheduling",
    label: "Headless scheduling",
    file: "schedule.sh",
    Icon: CalendarCheck,
    blurb:
      "Check availability and create bookings over REST, then build a fully custom booking flow.",
    code: HEADLESS_SCHED_SNIPPET,
  },
];

const headlessHandled: { label: string; Icon: LucideIcon }[] = [
  { label: "Spam filtering", Icon: Shield },
  { label: "Email notifications", Icon: Mail },
  { label: "Calendar sync", Icon: CalendarCheck },
  { label: "Workflows", Icon: Zap },
  { label: "CSV / JSON export", Icon: FileText },
];

export function HeadlessSection() {
  const [active, setActive] = useState(headlessModes[0].id);
  const current =
    headlessModes.find((mode) => mode.id === active) ?? headlessModes[0];

  return (
    <section
      id="developers"
      className="relative scroll-mt-24 py-24 sm:py-28 px-6"
    >
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Copy + mode selectors */}
        <div>
          <SectionHeading
            align="left"
            title="Bring your own frontend"
            subtitle="Headless forms and scheduling infrastructure. POST from plain HTML, fetch from any framework, or drive bookings over REST. LinkyCal handles storage, spam, email, and calendar sync."
          />

          <div className="mt-9 space-y-3">
            {headlessModes.map((mode) => {
              const isActive = mode.id === active;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setActive(mode.id)}
                  aria-pressed={isActive}
                  className={cn(
                    "w-full text-left flex items-start gap-4 rounded-[18px] px-5 py-4 transition-colors",
                    isActive
                      ? "bg-white ring-1 ring-brand/15 shadow-[0_10px_24px_-20px_rgba(15,26,20,0.22)]"
                      : "bg-[#F3F6F4] hover:bg-white/70",
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 transition-colors",
                      isActive
                        ? "bg-[#0F1A14] text-white"
                        : "bg-white text-foreground/70",
                    )}
                  >
                    <mode.Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">
                      {mode.label}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                      {mode.blurb}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* What LinkyCal handles for you */}
          <div className="flex flex-wrap items-center gap-2 mt-8">
            {headlessHandled.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F3F6F4] px-3.5 py-1.5 text-xs font-medium text-foreground/80"
              >
                <item.Icon className="w-3.5 h-3.5 text-brand" />
                {item.label}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-9">
            <Link
              to="/features/api"
              className="marketing-pill-dark h-12 px-7 gap-2 text-sm font-medium"
            >
              <Code2 className="w-4 h-4" />
              Explore the API
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 h-12 px-2 text-sm font-medium text-brand hover:text-foreground transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Read the docs
            </Link>
          </div>
        </div>

        {/* Live code panel */}
        <div className="marketing-panel p-5 sm:p-7">
          <div className="rounded-2xl bg-[#0f1a14] p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex items-center gap-[5px]">
                <div className="w-[9px] h-[9px] rounded-full bg-[#EC6A5E]/70" />
                <div className="w-[9px] h-[9px] rounded-full bg-[#F5BF4F]/70" />
                <div className="w-[9px] h-[9px] rounded-full bg-[#61C554]/70" />
              </div>
              <span className="ml-1.5 font-mono text-[11px] text-[#7fa890]">
                {current.file}
              </span>
            </div>
            <pre className="font-mono text-[12px] leading-6 text-[#d4e8dc] whitespace-pre-wrap break-words min-h-[232px]">
              {current.code}
            </pre>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">
            Real endpoints. Copy, paste, ship.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonial ─────────────────────────────────────────────────────────── */

const testimonialAvatars = [
  { initial: "S", bg: "bg-brand/10 text-brand" },
  { initial: "M", bg: "bg-[#3B82F6]/10 text-[#3B82F6]" },
  { initial: "J", bg: "bg-[#8B5CF6]/10 text-[#8B5CF6]" },
  { initial: "A", bg: "bg-[#F59E0B]/10 text-[#B45309]" },
  { initial: "R", bg: "bg-[#EC4899]/10 text-[#BE185D]" },
];

export function TestimonialSection() {
  return (
    <section className="relative py-24 sm:py-28 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
        <SectionHeading align="left" title="Loved by founders & lean teams" />
        <div>
          <div className="flex items-center gap-2 mb-7">
            {testimonialAvatars.map((avatar, i) => (
              <div
                key={avatar.initial}
                className={cn(
                  "w-12 h-12 rounded-[16px] flex items-center justify-center text-base font-bold",
                  avatar.bg,
                  i === 0 && "ring-2 ring-brand ring-offset-2",
                )}
              >
                {avatar.initial}
              </div>
            ))}
          </div>
          <blockquote className="text-xl sm:text-2xl font-medium text-foreground leading-snug text-balance">
            &ldquo;I run my entire GTM, product feedback and request demo workflows with LinkyCal. My AI agents love it, I do not even have to visit the dashboard, although it has a nice, thoughtful UX!&rdquo;
          </blockquote>
          <p className="text-sm text-muted-foreground mt-5">
            Mark Rudman, Founder at ImageAnimate AI
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ─────────────────────────────────────────────────────────────── */

interface PricingPlan {
  name: string;
  audience: string;
  monthlyPrice: number;
  annualPrice: number;
  highlighted: boolean;
  cta: string;
  features: string[];
  excluded: string[];
}

const pricingPlans: PricingPlan[] = [
  {
    name: "Free plan",
    audience: "For personal projects & trying things out",
    monthlyPrice: 0,
    annualPrice: 0,
    highlighted: false,
    cta: "Get Started",
    features: [
      "1 project",
      "3 forms & 3 event types",
      "100 contacts",
      "1 workflow",
      "Community support",
    ],
    excluded: ["Google Calendar sync", "API access"],
  },
  {
    name: "Pro plan",
    audience: "For freelancers & small teams",
    monthlyPrice: 29,
    annualPrice: 24,
    highlighted: true,
    cta: "Start 7-Day Free Trial",
    features: [
      "5 projects",
      "20 forms & 20 event types per project",
      "5,000 contacts per project",
      "10 workflows",
      "Google Calendar sync",
      "API & MCP access",
      "Priority support",
    ],
    excluded: ["Custom embeddable widgets"],
  },
  {
    name: "Business plan",
    audience: "For growing teams & agencies",
    monthlyPrice: 99,
    annualPrice: 82,
    highlighted: false,
    cta: "Start 7-Day Free Trial",
    features: [
      "Everything in Pro +",
      "20 projects",
      "Unlimited forms, events & workflows",
      "Unlimited contacts",
      "Custom embeddable widgets",
      "Dedicated support",
    ],
    excluded: [],
  },
];

export function PricingSection({ onGetStarted }: MarketingCtaProps) {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="relative scroll-mt-24 py-24 sm:py-28 px-6">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          title="Flexible pricing plans"
          subtitle="Choose a plan that grows with you. Start for free and upgrade anytime for more capacity and support."
        />

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mt-10">
          <span
            className={cn(
              "text-sm font-medium transition-colors",
              annual ? "text-muted-foreground" : "text-foreground",
            )}
          >
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
            onClick={() => setAnnual((a) => !a)}
            className={cn(
              "relative w-12 h-7 rounded-full transition-colors duration-300",
              annual ? "bg-brand" : "bg-[#E2E8E4]",
            )}
          >
            <span
              className={cn(
                "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300",
                annual && "translate-x-5",
              )}
            />
          </button>
          <span
            className={cn(
              "text-sm font-medium transition-colors",
              annual ? "text-foreground" : "text-muted-foreground",
            )}
          >
            Annual{" "}
            <span className="text-brand font-semibold">2 months free</span>
          </span>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-6xl mx-auto">
          {pricingPlans.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            return (
              <div
                key={plan.name}
                className={cn(
                  "marketing-card p-2 flex flex-col",
                  plan.highlighted &&
                  "shadow-[0_40px_80px_-50px_rgba(27,67,50,0.6)]",
                )}
              >
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">
                        {plan.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-snug">
                        {plan.audience}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-heading text-[2.6rem] font-bold tracking-[-0.03em] text-foreground leading-none">
                        ${price}
                      </span>
                      <span className="text-sm text-muted-foreground block mt-1">
                        /month
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={onGetStarted}
                    className={cn(
                      "w-full h-12 justify-center gap-2 text-sm font-medium mt-6",
                      plan.highlighted
                        ? "marketing-pill-cta"
                        : "marketing-pill-dark",
                    )}
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="bg-[#F3F6F4] rounded-[20px] px-5 py-5 flex-1">
                  <p className="text-sm text-muted-foreground mb-3.5">
                    Included features:
                  </p>
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-foreground"
                      >
                        <Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                    {plan.excluded.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground/60 line-through"
                      >
                        <Check className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─────────────────────────────────────────────────────────────────── */

interface FaqItemData {
  question: string;
  answer: string;
}

const faqItems: FaqItemData[] = [
  {
    question: "What types of forms can I build?",
    answer:
      "LinkyCal supports multi-step forms with conditional logic, 12+ field types including text, email, phone, select, date, file upload, and more. You can create complex branching flows where fields appear or hide based on previous answers, and validate submissions in real-time.",
  },
  {
    question: "How does the booking system work?",
    answer:
      "You create event types with customizable durations, availability schedules, and buffer times. Share your booking link and visitors pick a time that works. If you connect Google Calendar, availability is synced automatically. Everything is timezone-aware, and confirmation emails are sent instantly.",
  },
  {
    question: "Can I embed widgets on my website?",
    answer:
      "Yes! Add a single script tag to your website and initialize the booking or form widget with one line of JavaScript. The widgets are self-contained with zero external dependencies, fully customizable themes, and work on any website — including WordPress, Webflow, and static HTML.",
  },
  {
    question: "Is there an API?",
    answer:
      "Yes, LinkyCal is headless-friendly. Post forms straight from plain HTML or fetch from any framework, and check availability and create bookings over REST. Use a project-scoped API key for contacts and management, plus an MCP server so AI agents can book on your behalf. Full OpenAPI docs and llms.txt are included.",
  },
  {
    question: "What's included in the free plan?",
    answer:
      "The free plan includes 1 project, 3 forms, 3 event types, 100 contacts, and 1 workflow. It's a great way to try LinkyCal for personal projects or small-scale use. Upgrade to Pro or Business when you need more capacity, calendar sync, or API access.",
  },
  {
    question: "Can I migrate from Calendly or Typeform?",
    answer:
      "Yes. You can import contacts via CSV for bulk migration, and our API allows programmatic migration of forms, event types, and contact data. If you need help with a large migration, our support team is available to assist.",
  },
];

function FaqItem({ question, answer }: FaqItemData) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[#F3F6F4] rounded-[20px] px-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-5 text-left group"
      >
        <span className="text-[15px] font-medium text-foreground group-hover:text-brand transition-colors pr-4">
          {question}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <p className="text-sm text-muted-foreground leading-relaxed pb-5">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  return (
    <section id="faq" className="relative scroll-mt-24 py-24 sm:py-28 px-6">
      <div className="max-w-3xl mx-auto">
        <SectionHeading title="Frequently asked questions" />
        <div className="space-y-3 mt-12">
          {faqItems.map((item) => (
            <FaqItem key={item.question} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ───────────────────────────────────────────────────────────── */

export function FinalCtaSection({ onGetStarted }: MarketingCtaProps) {
  return (
    <section className="marketing-cta-gradient relative pt-24 sm:pt-32 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          title="Take your forms & scheduling to the next level"
          subtitle="Create your free account and launch your first form or booking page in minutes. No credit card required."
        />
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-9">
          <button
            onClick={onGetStarted}
            className="marketing-pill-cta h-14 pl-8 pr-2.5 gap-3 text-[15px] font-medium"
          >
            Get Started — it&rsquo;s free
            <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
              <ArrowRight className="w-4 h-4" />
            </span>
          </button>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 h-14 px-7 rounded-full bg-white/70 backdrop-blur text-[15px] font-medium text-foreground shadow-sm hover:bg-white transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            View documentation
          </Link>
        </div>

        {/* One-line embed mock bleeding into the footer */}
        <div className="max-w-5xl mx-auto mt-16 sm:mt-20">
          <div className="bg-white rounded-t-[28px] border border-b-0 border-[#0F1A14]/6 shadow-[0_-30px_80px_-50px_rgba(15,26,20,0.4)] p-3 pb-0">
            <div className="rounded-t-[18px] border border-b-0 border-border/60 overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#F3F6F4]">
                <div className="flex gap-[6px]">
                  <div className="w-[9px] h-[9px] rounded-full bg-[#EC6A5E]" />
                  <div className="w-[9px] h-[9px] rounded-full bg-[#F5BF4F]" />
                  <div className="w-[9px] h-[9px] rounded-full bg-[#61C554]" />
                </div>
                <div className="flex-1 max-w-sm mx-auto h-[24px] rounded-md bg-white flex items-center justify-center px-3">
                  <span className="text-[11px] text-muted-foreground truncate">
                    yoursite.com
                  </span>
                </div>
              </div>

              {/* Split: code pane + live widget preview */}
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="bg-[#0f1a14] px-6 py-6 sm:px-8 h-[260px] sm:h-[340px] overflow-hidden hidden md:block">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[#5c7268] mb-4">
                    You write this
                  </div>
                  <pre className="font-mono text-[12px] sm:text-[13px] leading-7 whitespace-pre-wrap break-words text-[#d4e8dc]">
                    <span className="text-[#81c995]">&lt;script</span>{" "}
                    <span className="text-[#7ec8a0]">src</span>=
                    <span className="text-[#a8d8b9]">
                      "https://cdn.linkycal.com/widgets/booking.js"
                    </span>
                    <span className="text-[#81c995]">&gt;&lt;/script&gt;</span>
                    {"\n\n"}
                    <span className="text-[#81c995]">&lt;script&gt;</span>
                    {"\n  "}
                    <span className="text-[#d4e8dc]">LinkyCal.booking({"{"}</span>
                    {"\n    "}
                    <span className="text-[#7ec8a0]">projectSlug</span>:{" "}
                    <span className="text-[#a8d8b9]">"acme"</span>,{"\n    "}
                    <span className="text-[#7ec8a0]">eventSlug</span>:{" "}
                    <span className="text-[#a8d8b9]">"discovery-call"</span>
                    {"\n  "}
                    <span className="text-[#d4e8dc]">{"}"})</span>
                    {"\n"}
                    <span className="text-[#81c995]">&lt;/script&gt;</span>
                  </pre>
                </div>

                <div className="bg-white px-6 py-6 sm:px-10 h-[260px] sm:h-[340px] overflow-hidden">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-4">
                    Visitors see this
                  </div>
                  <div className="max-w-[330px] mx-auto">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <CalendarCheck className="w-5 h-5 text-brand" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground leading-tight">
                          Discovery call
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          30 min · Google Meet
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 mb-3">
                      {[
                        { day: "Mon", date: "16" },
                        { day: "Tue", date: "17" },
                        { day: "Wed", date: "18" },
                        { day: "Thu", date: "19" },
                        { day: "Fri", date: "20" },
                      ].map((d) => (
                        <div
                          key={d.day}
                          className={cn(
                            "rounded-[12px] py-2 text-center",
                            d.date === "17"
                              ? "bg-brand text-white"
                              : "bg-[#F3F6F4] text-foreground/70",
                          )}
                        >
                          <div className="text-[9px] font-medium uppercase tracking-wide opacity-70">
                            {d.day}
                          </div>
                          <div className="text-[13px] font-semibold mt-0.5">
                            {d.date}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      {["10:00 AM", "11:30 AM", "2:00 PM", "4:30 PM"].map(
                        (slot) => (
                          <div
                            key={slot}
                            className={cn(
                              "h-9 rounded-full border flex items-center justify-center text-xs font-medium",
                              slot === "2:00 PM"
                                ? "border-brand bg-brand/8 text-brand"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {slot}
                          </div>
                        ),
                      )}
                    </div>
                    <div className="h-10 rounded-full bg-brand text-white flex items-center justify-center gap-2 text-sm font-medium">
                      Confirm booking
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
