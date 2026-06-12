import { useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  Code2,
  FileText,
  GitBranch,
  Globe,
  Mail,
  Send,
  Sparkles,
  Tag,
  Upload,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import {
  LandingSceneBackground,
  LandingSceneSection,
} from "@/components/marketing/LandingScene";
import { FeatureShowcaseSection } from "@/components/marketing/FeatureShowcase";
import {
  HowItWorksSection,
  PricingSection,
  FaqSection,
  FinalCtaSection,
} from "@/components/marketing/MarketingSections";
import {
  MockBookingUI,
  MockFormBuilderUI,
  MockContactCrmUI,
  MockApiUI,
  MockWorkflowUI,
} from "@/components/marketing/FeatureMocks";
import { cn } from "@/lib/utils";

/* ─── Visual Helpers ──────────────────────────────────────────────────────── */

interface ScreenshotCardProps {
  src: string;
  alt: string;
}

function ScreenshotCard({ src, alt }: ScreenshotCardProps) {
  return (
    <div className="card-glow-primary p-3 w-full">
      <div className="rounded-2xl overflow-hidden bg-white border border-border/40">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-auto object-cover object-left-top"
        />
      </div>
    </div>
  );
}

interface CodeCardProps {
  title: string;
  caption: string;
  code: string;
}

function CodeCard({ title, caption, code }: CodeCardProps) {
  return (
    <div className="card-glow-secondary p-6 w-full">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
          <Code2 className="w-4 h-4 text-brand" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-[#0f1a14] p-4">
        <div className="flex items-center gap-[5px] mb-2.5">
          <div className="w-[7px] h-[7px] rounded-full bg-[#EC6A5E]/60" />
          <div className="w-[7px] h-[7px] rounded-full bg-[#F5BF4F]/60" />
          <div className="w-[7px] h-[7px] rounded-full bg-[#61C554]/60" />
        </div>
        <pre className="font-mono text-[11px] leading-5 text-[#d4e8dc] whitespace-pre-wrap break-words">
          {code}
        </pre>
      </div>
    </div>
  );
}

function WeeklyAvailabilityCard() {
  const rows = [
    { day: "Monday", range: "9:00 AM – 5:00 PM", on: true },
    { day: "Tuesday", range: "9:00 AM – 5:00 PM", on: true },
    { day: "Wednesday", range: "10:00 AM – 4:00 PM", on: true },
    { day: "Thursday", range: "9:00 AM – 5:00 PM", on: true },
    { day: "Friday", range: "9:00 AM – 1:00 PM", on: true },
    { day: "Saturday", range: "Unavailable", on: false },
  ];
  return (
    <div className="card-glow-secondary p-6 w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
          <CalendarCheck className="w-4 h-4 text-brand" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Weekly hours</h3>
          <p className="text-xs text-muted-foreground">
            Set once, reused by every event type
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.day}
            className="flex items-center justify-between rounded-[14px] bg-white/60 border border-brand/8 px-4 py-2.5"
          >
            <span className="text-xs font-medium text-foreground">{row.day}</span>
            <span
              className={cn(
                "text-xs",
                row.on ? "text-muted-foreground" : "text-muted-foreground/50",
              )}
            >
              {row.range}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepLibraryCard() {
  const steps = [
    { icon: Mail, label: "Send email" },
    { icon: Tag, label: "Add / remove tag" },
    { icon: Globe, label: "Call webhook" },
    { icon: Clock, label: "Wait" },
    { icon: GitBranch, label: "Condition" },
    { icon: Sparkles, label: "AI research" },
  ];
  return (
    <div className="card-glow-secondary p-6 w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
          <Send className="w-4 h-4 text-brand" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Step library</h3>
          <p className="text-xs text-muted-foreground">
            Chain steps in any order
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {steps.map((step) => (
          <div
            key={step.label}
            className="flex items-center gap-2.5 rounded-[14px] bg-white/60 border border-brand/8 px-3.5 py-3"
          >
            <div className="w-7 h-7 rounded-[8px] bg-brand/10 flex items-center justify-center shrink-0">
              <step.icon className="w-3.5 h-3.5 text-brand" />
            </div>
            <span className="text-xs font-medium text-foreground">
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagSegmentsCard() {
  const tags = [
    { name: "VIP", count: 18, color: "bg-amber-100 text-amber-800" },
    { name: "Active Lead", count: 47, color: "bg-emerald-100 text-emerald-800" },
    { name: "Newsletter", count: 230, color: "bg-sky-100 text-sky-800" },
    { name: "Booked a call", count: 64, color: "bg-violet-100 text-violet-800" },
  ];
  return (
    <div className="card-glow-secondary p-6 w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
          <Tag className="w-4 h-4 text-brand" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tag segments</h3>
          <p className="text-xs text-muted-foreground">
            Applied by hand or by workflows
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {tags.map((tag) => (
          <div
            key={tag.name}
            className="flex items-center justify-between rounded-[14px] bg-white/60 border border-brand/8 px-4 py-2.5"
          >
            <span
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-full",
                tag.color,
              )}
            >
              {tag.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {tag.count} contacts
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchLogicCard() {
  return (
    <div className="card-glow-secondary p-6 w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-brand" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Conditional logic
          </h3>
          <p className="text-xs text-muted-foreground">
            Fields appear based on earlier answers
          </p>
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="rounded-[14px] bg-white/60 border border-brand/8 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
            Question
          </div>
          <span className="text-xs font-medium text-foreground">
            "What's your budget?"
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] bg-white/60 border border-brand/8 px-3.5 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-brand mb-1.5">
              Under $1k
            </div>
            <span className="text-xs text-muted-foreground">
              → Show self-serve plans
            </span>
          </div>
          <div className="rounded-[14px] bg-brand/8 border border-brand/15 px-3.5 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-brand mb-1.5">
              $1k and up
            </div>
            <span className="text-xs text-muted-foreground">
              → Ask for company details, offer a call
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CsvImportCard() {
  const rows = [
    { name: "Priya Sharma", email: "priya@acme.com", state: "Imported" },
    { name: "Jon Maeda", email: "jon@studio.io", state: "Imported" },
    { name: "Lena Fischer", email: "lena@nord.de", state: "Merged" },
  ];
  return (
    <div className="card-glow-secondary p-6 w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
          <Upload className="w-4 h-4 text-brand" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">CSV import</h3>
          <p className="text-xs text-muted-foreground">
            Existing contacts merge by email
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.email}
            className="flex items-center justify-between rounded-[14px] bg-white/60 border border-brand/8 px-4 py-2.5"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {row.name}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {row.email}
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand shrink-0">
              <Check className="w-3 h-3" />
              {row.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Page Data ───────────────────────────────────────────────────────────── */

interface FeatureDeepDivePoint {
  title: string;
  description: string;
}

interface FeatureDeepDive {
  eyebrow: string;
  title: string;
  highlightedTitle?: string;
  description: string;
  points: FeatureDeepDivePoint[];
  Visual: () => ReactNode;
}

interface FeaturePageData {
  slug: string;
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  headline: string;
  highlightedHeadline: string;
  subcopy: string;
  checkmarks: [string, string, string];
  HeroVisual: () => ReactNode;
  deepDives: FeatureDeepDive[];
}

const EMBED_SNIPPET = `<script src="https://cdn.linkycal.com/widgets/booking.js"></script>
<script>
  LinkyCal.booking({ projectSlug: "acme" })
</script>`;

const NATIVE_FORM_SNIPPET = `<!-- LinkyCal native form endpoint -->
<form
  action="https://linkycal.com/api/public/forms/acme/contact/submit"
  method="post">
  <input name="full_name" />
  <input name="email" />
  <button>Send</button>
</form>`;

const API_SNIPPET = `# Check open slots
curl "https://linkycal.com/api/v1/availability/acme\\
?eventTypeSlug=intro-call&date=2026-07-01&timezone=UTC"

# Book one
curl -X POST https://linkycal.com/api/v1/bookings \\
  -d '{ "projectSlug": "acme", "eventTypeSlug": "intro-call",
        "name": "Sarah Chen", "email": "sarah@acme.com",
        "startTime": "2026-07-01T14:00:00Z", "timezone": "UTC" }'`;

const MCP_SNIPPET = `{
  "linkycal": {
    "type": "http",
    "url": "https://linkycal.com/api/mcp",
    "headers": { "Authorization": "Bearer lc_live_..." }
  }
}`;

const FEATURES: Record<string, FeaturePageData> = {
  scheduling: {
    slug: "scheduling",
    seoTitle: "Scheduling & Booking Pages",
    seoDescription:
      "Branded booking pages and widgets with real-time Google Calendar sync, timezone-aware slots, buffer times, and instant confirmation emails.",
    eyebrow: "Scheduling",
    headline: "Booking links that",
    highlightedHeadline: "stay in sync.",
    subcopy:
      "Create event types, set your availability once, then share a link or embed a widget. LinkyCal checks Google Calendar live, shows every visitor their local time, and confirms the moment they book.",
    checkmarks: [
      "Real-time Google Calendar sync",
      "Timezone-aware for every visitor",
      "Instant confirmation emails",
    ],
    HeroVisual: MockBookingUI,
    deepDives: [
      {
        eyebrow: "Availability",
        title: "Your calendar is",
        highlightedTitle: "the source of truth.",
        description:
          "Connect Google Calendar and LinkyCal blocks anything already on it — no double bookings, no manual upkeep. Buffers and daily limits keep your day humane.",
        points: [
          {
            title: "Live free/busy checks",
            description:
              "Every slot a visitor sees is checked against your real calendar at that moment.",
          },
          {
            title: "Buffers and daily caps",
            description:
              "Add prep time before and after meetings, and cap how many bookings a day can take.",
          },
          {
            title: "Pending or instant",
            description:
              "Auto-confirm bookings, or require your approval before anything lands on the calendar.",
          },
        ],
        Visual: () => (
          <ScreenshotCard
            src="/screenshots/booking.webp"
            alt="LinkyCal hosted booking page with date and time slot picker"
          />
        ),
      },
      {
        eyebrow: "Event types",
        title: "One schedule,",
        highlightedTitle: "every kind of meeting.",
        description:
          "Discovery calls, demos, office hours — each event type gets its own duration, location, booking form, and destination calendar, all drawing from the hours you set once.",
        points: [
          {
            title: "Per-event destinations",
            description:
              "Send demos to the sales calendar and interviews to your own — per event type.",
          },
          {
            title: "Custom booking questions",
            description:
              "Attach a form to any event type and qualify guests while they book.",
          },
          {
            title: "Switch off anytime",
            description:
              "Disable an event type when you're at capacity — its links stop taking new bookings instantly.",
          },
        ],
        Visual: WeeklyAvailabilityCard,
      },
      {
        eyebrow: "Embed",
        title: "Add booking to",
        highlightedTitle: "any website.",
        description:
          "Drop the widget into any page with two script tags, share the hosted link, or build your own UI on the API. The booking flow matches your brand either way.",
        points: [
          {
            title: "Two-line embed",
            description:
              "Works on any site builder or hand-rolled page — no iframe gymnastics.",
          },
          {
            title: "Hosted fallback",
            description:
              "No website? Every event type gets a clean hosted page at your project's URL.",
          },
          {
            title: "Build on the API",
            description:
              "Fetch open slots and create bookings from your own UI when you want full control.",
          },
        ],
        Visual: () => (
          <CodeCard
            title="One-line embed"
            caption="Add booking to any website"
            code={EMBED_SNIPPET}
          />
        ),
      },
    ],
  },

  forms: {
    slug: "forms",
    seoTitle: "Multi-Step Form Builder",
    seoDescription:
      "Build multi-step forms with conditional logic, 12+ field types, file uploads, and validation. Embed the widget, share a hosted link, or POST from plain HTML.",
    eyebrow: "Forms",
    headline: "Forms that adapt to",
    highlightedHeadline: "every answer.",
    subcopy:
      "A visual builder for contact forms, quizzes, intake flows, and surveys. Branch on answers, split long forms into steps, and collect submissions wherever your audience is.",
    checkmarks: [
      "Multi-step with conditional logic",
      "12+ field types incl. file upload",
      "Embed, host, or plain-HTML POST",
    ],
    HeroVisual: MockFormBuilderUI,
    deepDives: [
      {
        eyebrow: "Builder",
        title: "A visual builder with",
        highlightedTitle: "a live preview.",
        description:
          "Drag fields into sections, reorder steps, set validation rules, and watch the live preview update as you go. No schema files, no rebuild step.",
        points: [
          {
            title: "Sections become steps",
            description:
              "Group questions into sections and they render as a step-by-step flow with progress.",
          },
          {
            title: "Validation built in",
            description:
              "Required fields, email and phone formats, ranges — enforced as people type.",
          },
          {
            title: "12+ field types",
            description:
              "Text, email, phone, dropdowns, ratings, file uploads, and more.",
          },
        ],
        Visual: () => (
          <ScreenshotCard
            src="/screenshots/form-builder.webp"
            alt="LinkyCal form builder editing a multi-step quote form"
          />
        ),
      },
      {
        eyebrow: "Logic",
        title: "Branch on what",
        highlightedTitle: "they tell you.",
        description:
          "Show, hide, or require fields based on earlier answers. Short forms for simple cases, deeper questions only when they're relevant.",
        points: [
          {
            title: "Field-level conditions",
            description:
              "Equals, contains, greater-than — combine conditions to control any field or step.",
          },
          {
            title: "Smarter completion rates",
            description:
              "People only see questions that apply to them, so more of them finish.",
          },
          {
            title: "Reads earlier steps",
            description:
              "Conditions can reference answers from any previous step, not just the current screen.",
          },
        ],
        Visual: BranchLogicCard,
      },
      {
        eyebrow: "Submit anywhere",
        title: "Works with the site",
        highlightedTitle: "you already have.",
        description:
          "Use the embeddable widget, the hosted page, or skip our UI entirely — a native HTML form can POST straight to your form's endpoint.",
        points: [
          {
            title: "Plain HTML works",
            description:
              "Point action= at your form endpoint and field names map automatically.",
          },
          {
            title: "Responses in one place",
            description:
              "However it's submitted, every response lands in the same dashboard and triggers the same workflows.",
          },
          {
            title: "Spam filtered out",
            description:
              "Honeypot checks and rate limits stop bots before they reach your responses.",
          },
        ],
        Visual: () => (
          <CodeCard
            title="Native HTML forms"
            caption="POST directly with action="
            code={NATIVE_FORM_SNIPPET}
          />
        ),
      },
    ],
  },

  contacts: {
    slug: "contacts",
    seoTitle: "Contacts CRM",
    seoDescription:
      "A mini CRM that fills itself in: every form response and booking becomes a contact with tags, an activity timeline, and search.",
    eyebrow: "Contacts",
    headline: "A CRM that fills",
    highlightedHeadline: "itself in.",
    subcopy:
      "Every submission and booking becomes a contact automatically — tagged, timestamped, and searchable. No copy-pasting into a spreadsheet, no separate CRM to keep honest.",
    checkmarks: [
      "Auto-created from forms & bookings",
      "Tags and activity timeline",
      "CSV import, search, and views",
    ],
    HeroVisual: () => (
      <ScreenshotCard
        src="/screenshots/contacts.webp"
        alt="LinkyCal contacts list inside the dashboard"
      />
    ),
    deepDives: [
      {
        eyebrow: "Timeline",
        title: "Every interaction,",
        highlightedTitle: "one history.",
        description:
          "Form submissions, bookings, cancellations, tag changes, workflow runs — each contact carries a complete, ordered record of how they've engaged.",
        points: [
          {
            title: "Automatic linking",
            description:
              "A booking and a form response from the same email merge into one contact.",
          },
          {
            title: "Context before the call",
            description:
              "Open a contact and see everything they've told you before you say hello.",
          },
          {
            title: "Notes and details",
            description:
              "Add phone numbers, notes, and custom fields to round out the record.",
          },
        ],
        Visual: MockContactCrmUI,
      },
      {
        eyebrow: "Segments",
        title: "Find the right people",
        highlightedTitle: "with tags and views.",
        description:
          "Tag contacts by hand or let workflows do it — then filter, build saved views, and target follow-ups at exactly the right group.",
        points: [
          {
            title: "Workflow auto-tagging",
            description:
              "\"Booked a demo\", \"VIP\", \"Cancelled twice\" — applied the moment it happens.",
          },
          {
            title: "Saved views",
            description:
              "Combine tags, activity, and booking status into views your team can reuse.",
          },
          {
            title: "Search everything",
            description:
              "Find anyone by name, email, or phone in a couple of keystrokes.",
          },
        ],
        Visual: TagSegmentsCard,
      },
      {
        eyebrow: "Import",
        title: "Already have a list?",
        highlightedTitle: "Import it.",
        description:
          "Import existing contacts from CSV and they merge cleanly by email — history intact, duplicates avoided, ready to book and fill forms.",
        points: [
          {
            title: "Merge by email",
            description:
              "Re-imports and overlapping sources update contacts instead of duplicating them.",
          },
          {
            title: "Export any time",
            description: "Your data stays yours — pull it back out whenever you need.",
          },
          {
            title: "Useful immediately",
            description:
              "Imported contacts work with tags, views, and workflows right away.",
          },
        ],
        Visual: CsvImportCard,
      },
    ],
  },

  workflows: {
    slug: "workflows",
    seoTitle: "Workflow Automation",
    seoDescription:
      "Trigger automations from form submissions and bookings: send emails, add tags, call webhooks, wait, branch on conditions, and run AI research steps.",
    eyebrow: "Workflows",
    headline: "Automation that starts",
    highlightedHeadline: "the moment they submit.",
    subcopy:
      "Pick a trigger — form submitted, booking created, tag added — and chain the follow-up: emails, tags, webhooks, waits, conditional branches, even AI research on the lead.",
    checkmarks: [
      "Triggers for forms, bookings & tags",
      "Email, tags, webhooks, waits, branches",
      "AI research steps built in",
    ],
    HeroVisual: MockWorkflowUI,
    deepDives: [
      {
        eyebrow: "Builder",
        title: "Pick a trigger,",
        highlightedTitle: "stack the steps.",
        description:
          "Choose what kicks the workflow off — a form submission, a new booking, a tag — then add the steps that should follow, in order. Every run is logged step by step so you always know what happened.",
        points: [
          {
            title: "Templates to start from",
            description:
              "Lead research, booking triage, cancellation recovery — customize from a working base.",
          },
          {
            title: "Run history",
            description:
              "Each execution shows which steps ran, what they did, and why branches went the way they did.",
          },
          {
            title: "Run it manually",
            description:
              "Trigger a workflow on a single contact to test every step before it goes live.",
          },
        ],
        Visual: () => (
          <ScreenshotCard
            src="/screenshots/workflows.webp"
            alt="LinkyCal workflow templates triggered by forms and bookings"
          />
        ),
      },
      {
        eyebrow: "Steps",
        title: "Emails, tags, webhooks —",
        highlightedTitle: "even AI research.",
        description:
          "Notify people, update your CRM, call your own systems, and pace it all out over hours or days — from one builder.",
        points: [
          {
            title: "AI research",
            description:
              "Enrich a new lead automatically and drop the summary into their contact record.",
          },
          {
            title: "Webhooks out",
            description:
              "Post the full context to any URL and plug LinkyCal into the rest of your stack.",
          },
          {
            title: "Emails that personalize",
            description:
              "Email steps fill in contact and booking details with template variables.",
          },
        ],
        Visual: StepLibraryCard,
      },
      {
        eyebrow: "Conditions",
        title: "Not everyone gets",
        highlightedTitle: "the same follow-up.",
        description:
          "Route VIPs differently, skip follow-ups for people who already booked, escalate big budgets — conditions read answers, tags, and booking details.",
        points: [
          {
            title: "Answer-aware",
            description:
              "Conditions can reference any form field, contact tag, or booking attribute.",
          },
          {
            title: "Waits between steps",
            description:
              "Pause minutes or days mid-flow — follow-ups land when they should, not instantly.",
          },
          {
            title: "Combine rules",
            description:
              "Stack multiple conditions to target exactly the right situation.",
          },
        ],
        Visual: BranchLogicCard,
      },
    ],
  },

  api: {
    slug: "api",
    seoTitle: "Public API & MCP Server",
    seoDescription:
      "Every LinkyCal feature over REST with API-key auth, OpenAPI docs and llms.txt — plus an MCP server so AI agents can book meetings, submit forms, and manage contacts.",
    eyebrow: "API & MCP",
    headline: "The whole platform,",
    highlightedHeadline: "programmable.",
    subcopy:
      "Check availability, create bookings, submit forms, and manage contacts over REST — or hand a project-scoped API key to an AI agent through the built-in MCP server.",
    checkmarks: [
      "REST API for every feature",
      "OpenAPI spec + llms.txt docs",
      "MCP server for AI agents",
    ],
    HeroVisual: MockApiUI,
    deepDives: [
      {
        eyebrow: "REST",
        title: "One API for",
        highlightedTitle: "everything.",
        description:
          "Everything the dashboard does, your code can do: list open slots, book them, push form responses, read and update contacts. Keys are scoped to a single project.",
        points: [
          {
            title: "Project-scoped keys",
            description:
              "Create keys per environment or integration — each one sees exactly one project.",
          },
          {
            title: "Build your own UI",
            description:
              "Skip our widgets entirely and render booking and forms in your own frontend.",
          },
          {
            title: "One header to auth",
            description:
              "A single Authorization: Bearer header — no OAuth dance for your own integrations.",
          },
        ],
        Visual: () => (
          <CodeCard
            title="Availability → booking"
            caption="Two requests, one confirmed meeting"
            code={API_SNIPPET}
          />
        ),
      },
      {
        eyebrow: "MCP",
        title: "Built for",
        highlightedTitle: "AI agents.",
        description:
          "LinkyCal ships an MCP server at /api/mcp. Connect Claude, Cursor, or any MCP client with an API key and your agent can check availability, book meetings, manage contacts, and read form responses — scoped to one project.",
        points: [
          {
            title: "30 tools out of the box",
            description:
              "Bookings, availability, contacts, event types, forms, and workflows — read and write.",
          },
          {
            title: "Same rules as the dashboard",
            description:
              "Agent-created bookings send the same confirmations and trigger the same workflows.",
          },
          {
            title: "Any MCP client",
            description:
              "Claude Code, Cursor, or anything that speaks Streamable HTTP over MCP.",
          },
        ],
        Visual: () => (
          <CodeCard
            title="Connect an agent"
            caption="MCP client config — works with Claude Code & Cursor"
            code={MCP_SNIPPET}
          />
        ),
      },
      {
        eyebrow: "Docs",
        title: "Docs your tools",
        highlightedTitle: "can read.",
        description:
          "Human-readable docs, an OpenAPI spec, and llms.txt for AI assistants — so the integration your team (or their copilot) writes is right the first time.",
        points: [
          {
            title: "OpenAPI spec",
            description: "Generate clients and keep request shapes honest.",
          },
          {
            title: "llms.txt",
            description:
              "Point an AI assistant at linkycal.com and it knows the API surface.",
          },
          {
            title: "Copy-paste examples",
            description:
              "Every endpoint in the docs comes with a working request you can run as-is.",
          },
        ],
        Visual: () => (
          <div className="card-glow-secondary p-6 w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-brand" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Developer docs
                </h3>
                <p className="text-xs text-muted-foreground">
                  Everything in one place
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: "API reference", path: "/docs" },
                { label: "OpenAPI spec", path: "/openapi.json" },
                { label: "llms.txt", path: "/llms.txt" },
              ].map((doc) => (
                <div
                  key={doc.label}
                  className="flex items-center justify-between rounded-[14px] bg-white/60 border border-brand/8 px-4 py-2.5"
                >
                  <span className="text-xs font-medium text-foreground">
                    {doc.label}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {doc.path}
                  </span>
                </div>
              ))}
            </div>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-brand hover:text-foreground transition-colors"
            >
              View documentation
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ),
      },
    ],
  },
};

/* ─── Page ────────────────────────────────────────────────────────────────── */

interface PanelHeaderRowProps {
  eyebrow: string;
  index: number;
  total: number;
}

function PanelHeaderRow({ eyebrow, index, total }: PanelHeaderRowProps) {
  const step = String(index + 1).padStart(2, "0");
  const totalSteps = String(total).padStart(2, "0");
  const progressWidth = `${((index + 1) / total) * 100}%`;
  return (
    <div className="flex items-center gap-4 mb-8">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-brand" />
        <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          {eyebrow}
        </span>
      </div>
      <div className="relative h-px flex-1 bg-brand/12 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-brand"
          style={{ width: progressWidth }}
        />
      </div>
      <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
        {step}/{totalSteps}
      </span>
    </div>
  );
}

interface DeepDivePanelProps {
  dive: FeatureDeepDive;
  index: number;
  total: number;
  flip: boolean;
}

function DeepDivePanel({ dive, index, total, flip }: DeepDivePanelProps) {
  const Visual = dive.Visual;
  return (
    <article className="feature-editorial-panel p-5 sm:p-7 lg:p-8">
      <PanelHeaderRow eyebrow={dive.eyebrow} index={index} total={total} />

      {/* Top: copy | visual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
        <div className={cn(flip && "lg:order-last")}>
          <h2 className="font-heading text-3xl sm:text-[2.5rem] font-medium tracking-tight leading-tight">
            {dive.title}{" "}
            {dive.highlightedTitle && (
              <span className="text-brand">{dive.highlightedTitle}</span>
            )}
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mt-4 max-w-xl">
            {dive.description}
          </p>
        </div>
        <div className="flex justify-center">
          <div className="w-full max-w-lg">
            <Visual />
          </div>
        </div>
      </div>

      {/* Bottom: point cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        {dive.points.map((point) => (
          <div
            key={point.title}
            className="rounded-[20px] border border-brand/10 bg-white/45 px-4 pt-4 pb-5 backdrop-blur-xl"
          >
            <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center mb-3">
              <Check className="w-3.5 h-3.5 text-brand" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              {point.title}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {point.description}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function FeaturePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const feature = slug ? FEATURES[slug] : undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const onGetStarted = useCallback(() => {
    navigate("/?show_auth=true");
  }, [navigate]);

  if (!feature) {
    return <Navigate to="/" replace />;
  }

  const HeroVisual = feature.HeroVisual;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
      <SEOHead
        title={feature.seoTitle}
        description={feature.seoDescription}
        canonical={`https://linkycal.com/features/${feature.slug}`}
      />

      <MarketingNav onGetStarted={onGetStarted} />

      {/* ── Header: copy left, product visual right ─────────────────────── */}
      <section className="relative isolate pt-28 pb-20 overflow-hidden">
        {/* Soft brand wash */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(45,106,79,0.04) 55%, rgba(45,106,79,0.07) 100%), radial-gradient(110% 70% at 18% 0%, rgba(45,106,79,0.09), transparent 55%)",
          }}
        />
        {/* Dot grid texture, faded toward the edges */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(rgba(27,67,50,0.13) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage:
              "radial-gradient(85% 70% at 50% 30%, rgba(0,0,0,0.5), transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(85% 70% at 50% 30%, rgba(0,0,0,0.5), transparent 100%)",
          }}
        />
        {/* Background glow orbs */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-brand/[0.07] rounded-full blur-[120px] animate-[glowPulse_6s_ease-in-out_infinite] pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-brand-dark/[0.06] rounded-full blur-[100px] animate-[glowPulse_8s_ease-in-out_infinite_2s] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative pt-10">
          <div className="flex flex-col lg:flex-row lg:items-center gap-12 xl:gap-16">
            <div className="max-w-4xl lg:flex-1 lg:min-w-0">
              <div className="text-sm font-medium text-brand uppercase tracking-wider mb-4">
                {feature.eyebrow}
              </div>
              <h1 className="font-heading text-[2.75rem] sm:text-[3.5rem] xl:text-[4rem] font-medium tracking-tight leading-[1.06] text-balance">
                {feature.headline}{" "}
                <span className="text-brand">{feature.highlightedHeadline}</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mt-5 mb-8">
                {feature.subcopy}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={onGetStarted}
                  className="glow-surface rounded-full h-12 px-8 text-sm font-medium inline-flex items-center justify-center gap-2"
                >
                  Start free
                  <ArrowRight className="w-4 h-4" />
                </button>
                <Link
                  to="/docs"
                  className="glow-surface-subtle rounded-full h-12 px-6 text-sm font-medium inline-flex items-center justify-center text-foreground"
                >
                  View Documentation
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6 text-sm font-medium text-foreground">
                {feature.checkmarks.map((mark) => (
                  <span key={mark} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-brand" />
                    {mark}
                  </span>
                ))}
              </div>
            </div>

            {/* Product visual */}
            <div className="hidden lg:block w-[26rem] xl:w-[30rem] shrink-0">
              <HeroVisual />
            </div>
          </div>
        </div>
      </section>

      <div className="relative isolate">
        <LandingSceneBackground />

        {/* ── Feature deep dives ──────────────────────────────────────────── */}
        <LandingSceneSection fullHeight={false}>
          <div className="space-y-6 lg:space-y-8">
            {feature.deepDives.map((dive, index) => (
              <DeepDivePanel
                key={dive.title}
                dive={dive}
                index={index}
                total={feature.deepDives.length}
                flip={index % 2 === 1}
              />
            ))}
          </div>
        </LandingSceneSection>

        {/* ── Repeated landing sections ───────────────────────────────────── */}
        <FeatureShowcaseSection />
      </div>

      <HowItWorksSection />
      <PricingSection onGetStarted={onGetStarted} />
      <FaqSection />
      <FinalCtaSection onGetStarted={onGetStarted} />
      <MarketingFooter />
    </div>
  );
}
