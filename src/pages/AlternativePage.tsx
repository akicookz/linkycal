import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronDown,
  Code2,
  FileText,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import {
  PricingSection,
  FinalCtaSection,
} from "@/components/marketing/MarketingSections";
import {
  MockBookingUI,
  MockFormBuilderUI,
} from "@/components/marketing/FeatureMocks";
import { cn } from "@/lib/utils";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface CompareRow {
  label: string;
  linkycal: boolean | string;
  competitor: boolean | string;
}

interface SwitchReason {
  Icon: LucideIcon;
  title: string;
  body: string;
}

interface AltFaq {
  question: string;
  answer: string;
}

interface AlternativeData {
  slug: string;
  competitor: string;
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  headline: string;
  highlightedHeadline: string;
  subcopy: string;
  checkmarks: [string, string, string];
  HeroVisual: () => ReactNode;
  intro: string;
  rows: CompareRow[];
  reasons: SwitchReason[];
  faqs: AltFaq[];
  closing: string;
}

/* ─── Data ────────────────────────────────────────────────────────────────── */

const ALTERNATIVES: Record<string, AlternativeData> = {
  formspree: {
    slug: "formspree",
    competitor: "Formspree",
    seoTitle: "Formspree Alternative",
    seoDescription:
      "Looking for a Formspree alternative? LinkyCal gives you headless forms that post from plain HTML, plus booking pages, contacts, and workflows in one backend.",
    eyebrow: "The Formspree alternative",
    headline: "The headless form backend",
    highlightedHeadline: "for vibe coders.",
    subcopy:
      "Formspree is great at catching form submissions, and if that is all you need it does the job. Most people who come to us also want a booking page, a contact list, and a way to follow up. LinkyCal gives you the headless forms you came for and the scheduling you were about to go buy somewhere else, in one place.",
    checkmarks: [
      "Post from plain HTML or any framework",
      "Booking pages built in",
      "Free plan to start",
    ],
    HeroVisual: MockFormBuilderUI,
    intro:
      "Picture your stack right now. Formspree handles the contact form, then a separate tool handles meetings, then a spreadsheet keeps track of who is who. That is three logins and three bills for something that should feel like one. LinkyCal pulls it into a single backend so a form submission, a booking, and a contact all live together.",
    rows: [
      { label: "Native HTML form posting", linkycal: true, competitor: true },
      { label: "Multi-step form builder", linkycal: true, competitor: false },
      { label: "Scheduling & booking pages", linkycal: true, competitor: false },
      { label: "Contacts CRM with tags", linkycal: true, competitor: false },
      { label: "Built-in workflows", linkycal: true, competitor: "Zapier only" },
      { label: "Google Calendar sync", linkycal: true, competitor: false },
      { label: "Free plan to start", linkycal: true, competitor: true },
    ],
    reasons: [
      {
        Icon: Code2,
        title: "Keep posting from plain HTML",
        body: "Point your form action at LinkyCal and submissions land just like they do today. No rewrite, no new framework, no server code. You keep your markup, we handle storage, spam, and email.",
      },
      {
        Icon: CalendarCheck,
        title: "Scheduling without a second app",
        body: "Share a booking link or embed a widget on the same project. Availability stays in sync with your calendar, so you stop paying for a separate scheduler.",
      },
      {
        Icon: Workflow,
        title: "Turn submissions into follow-up",
        body: "Every submission can tag a contact, fire a webhook, or kick off a workflow. The lead does not just sit in an inbox waiting for you to notice.",
      },
    ],
    faqs: [
      {
        question: "Can I move my existing forms over?",
        answer:
          "Yes, and it is quick. Swap the form action URL to your LinkyCal endpoint and you are live. Your fields keep their names, so nothing on your page has to change.",
      },
      {
        question: "Do I have to use your form builder?",
        answer:
          "Not at all. Bring your own HTML or your own React components and POST to the API. The builder is there if you want it, never a requirement.",
      },
      {
        question: "Is there a free plan?",
        answer:
          "Yes. You can start free, build a form, and take real submissions before you pay anything.",
      },
    ],
    closing:
      "If you only ever need to catch a form, Formspree is fine. The moment you also want to book a call and keep the contact, LinkyCal saves you a tool.",
  },

  typeform: {
    slug: "typeform",
    competitor: "Typeform",
    seoTitle: "Typeform Alternative",
    seoDescription:
      "A Typeform alternative with multi-step forms, built-in scheduling, and a contact list, at a price that does not jump every time someone replies.",
    eyebrow: "The Typeform alternative",
    headline: "Beautiful, agent-friendly forms,",
    highlightedHeadline: "without the response meter.",
    subcopy:
      "Typeform makes a beautiful form, no argument there. The trouble starts when the response cap fills up, or you realize you also need to book the meeting the form was asking about. LinkyCal gives you clean multi-step forms, a booking page, and a contact list together, at a price that does not punish you for being popular.",
    checkmarks: [
      "Multi-step forms with logic",
      "Scheduling in the same flow",
      "Your branding, your embed",
    ],
    HeroVisual: MockFormBuilderUI,
    intro:
      "A form is usually step one. Someone fills it in, and then you want to talk to them. With Typeform that next step lives in another tool. With LinkyCal the form, the calendar, and the contact record are the same project, so the handoff from answer to booked call takes zero copy and paste.",
    rows: [
      { label: "Multi-step forms with logic", linkycal: true, competitor: true },
      { label: "Embeddable widgets", linkycal: true, competitor: true },
      { label: "Native HTML & headless API", linkycal: true, competitor: "Limited" },
      { label: "Scheduling & booking pages", linkycal: true, competitor: false },
      { label: "Contacts CRM with tags", linkycal: true, competitor: false },
      { label: "Built-in workflows", linkycal: true, competitor: "Add-ons" },
      { label: "Free plan to start", linkycal: true, competitor: true },
    ],
    reasons: [
      {
        Icon: FileText,
        title: "Multi-step forms with logic",
        body: "Branching, conditional fields, and a clean step by step flow. Your form still looks sharp, it just does not lock the good parts behind the top tier.",
      },
      {
        Icon: CalendarCheck,
        title: "Book the meeting in the same flow",
        body: "Attach a booking step or send people straight to a scheduling link. No exporting answers into a separate calendar app.",
      },
      {
        Icon: Code2,
        title: "Own your data and your UI",
        body: "Embed the widget, share the hosted page, or build the whole thing on the API. You decide how it looks and where the responses go.",
      },
    ],
    faqs: [
      {
        question: "Will my forms still look good?",
        answer:
          "Yes. You get multi-step layouts, your own branding, and embeds that match your site. Looking nice is table stakes here, not an upsell.",
      },
      {
        question: "What about response limits?",
        answer:
          "Our plans are built around projects and features, not a meter that punishes you for getting replies. Check the pricing below for the exact numbers.",
      },
      {
        question: "Can I also schedule meetings?",
        answer:
          "That is the whole point. Scheduling is built in, so the person who fills your form can book time without leaving.",
      },
    ],
    closing:
      "Keep the polish, drop the second subscription. That is the trade most people switching from Typeform are happy to make.",
  },

  tally: {
    slug: "tally",
    competitor: "Tally",
    seoTitle: "Tally Alternative",
    seoDescription:
      "A Tally alternative that keeps the easy form builder and adds built-in scheduling, a contacts CRM, and workflows, all in one backend.",
    eyebrow: "The Tally alternative",
    headline: "Beautiful, free forms,",
    highlightedHeadline: "to share or embed anywhere.",
    subcopy:
      "Tally is a lovely free form builder, and we mean that. Where it stops is the rest of the job. Once a form comes in you still need to schedule the meeting, keep the contact, and follow up. LinkyCal does the forms and all of that next part in one backend.",
    checkmarks: [
      "Quick, visual form builder",
      "Booking pages included",
      "Contacts list built in",
    ],
    HeroVisual: MockBookingUI,
    intro:
      "Most people land on Tally because it is generous and easy. Then the workflow grows. You add a scheduling tool, then a place to store contacts, then a zap to glue them together. LinkyCal is what that pile of tools wants to be when it grows up, forms and scheduling and contacts under one roof.",
    rows: [
      { label: "Quick multi-step form builder", linkycal: true, competitor: true },
      { label: "Scheduling & booking pages", linkycal: true, competitor: false },
      { label: "Contacts CRM with tags", linkycal: true, competitor: false },
      { label: "Headless forms API", linkycal: true, competitor: "Limited" },
      { label: "Built-in workflows", linkycal: true, competitor: "Integrations" },
      { label: "Google Calendar sync", linkycal: true, competitor: false },
      { label: "Free plan to start", linkycal: true, competitor: true },
    ],
    reasons: [
      {
        Icon: Workflow,
        title: "Forms that do not stop at submit",
        body: "Build multi-step forms, then send the submission straight into a booking, a tag, or a workflow. The answer turns into action on its own.",
      },
      {
        Icon: CalendarCheck,
        title: "Scheduling that is actually built in",
        body: "A booking page and live calendar sync ship with your project. No separate scheduler, no second login.",
      },
      {
        Icon: Users,
        title: "A real contact list",
        body: "Every form and booking can create or update a contact, so you are building a list as you go instead of digging through a spreadsheet.",
      },
    ],
    faqs: [
      {
        question: "Is LinkyCal free too?",
        answer:
          "Yes, there is a free plan you can build and launch on. You move up when you need more projects, calendar sync, or the API.",
      },
      {
        question: "Do I lose the simple builder?",
        answer:
          "No. Building a form stays quick and visual. You just get scheduling and contacts sitting right next to it.",
      },
      {
        question: "Can I embed on any site?",
        answer:
          "Yes. Drop in a script tag or POST from plain HTML. It works on Webflow, WordPress, or a hand coded page.",
      },
    ],
    closing:
      "Tally wins on a quick free form. LinkyCal wins the minute that form needs to lead somewhere, like a booked meeting and a saved contact.",
  },

  calendly: {
    slug: "calendly",
    competitor: "Calendly",
    seoTitle: "Calendly Alternative",
    seoDescription:
      "A Calendly alternative with the booking links you expect, plus a real multi-step form builder and a contacts CRM in the same project.",
    eyebrow: "The Calendly alternative",
    headline: "Scheduling,",
    highlightedHeadline: "with real forms attached.",
    subcopy:
      "Calendly nails the booking link, and people expect that experience. What it does not give you is a real form builder or a place to keep your contacts. LinkyCal hands you the scheduling you already rely on, plus multi-step forms and a contact list in the same project, so intake and calendar finally work as one.",
    checkmarks: [
      "Event types & availability",
      "Live Google Calendar sync",
      "Full form builder included",
    ],
    HeroVisual: MockBookingUI,
    intro:
      "Think about how a booking usually starts. Someone answers a few questions, then picks a time. Calendly is brilliant at the picking a time half and thin on the questions half. LinkyCal treats them as one flow, so the form that qualifies the lead and the calendar that books them are the same tool.",
    rows: [
      { label: "Booking & availability", linkycal: true, competitor: true },
      { label: "Google Calendar sync", linkycal: true, competitor: true },
      { label: "Multi-step form builder", linkycal: true, competitor: "Basic" },
      { label: "Headless forms + scheduling API", linkycal: true, competitor: "Scheduling only" },
      { label: "Contacts CRM with tags", linkycal: true, competitor: "Limited" },
      { label: "Built-in workflows", linkycal: true, competitor: "Paid tiers" },
      { label: "One tool for forms + scheduling", linkycal: true, competitor: false },
    ],
    reasons: [
      {
        Icon: CalendarCheck,
        title: "Scheduling you already know",
        body: "Event types, availability rules, buffers, and live Google Calendar sync. Everything you came to Calendly for is here and works the way you expect.",
      },
      {
        Icon: FileText,
        title: "Forms that are more than a few fields",
        body: "Build true multi-step forms with logic, not just a short list of booking questions. Qualify people properly before they ever hit your calendar.",
      },
      {
        Icon: Users,
        title: "Keep every contact",
        body: "Each booking and form builds your contact list, with tags and a timeline. No exporting to a separate CRM to remember who booked.",
      },
    ],
    faqs: [
      {
        question: "Does the scheduling match what I have in Calendly?",
        answer:
          "Yes. You set your hours once, connect Google Calendar, and LinkyCal checks it live so you never get double booked.",
      },
      {
        question: "Can I collect more than booking questions?",
        answer:
          "Much more. You get a full form builder with steps and conditional logic, separate from the booking flow or attached to it.",
      },
      {
        question: "Is there a free plan?",
        answer:
          "Yes, you can start free and connect a calendar when you upgrade.",
      },
    ],
    closing:
      "If all you ever need is a time picker, Calendly is solid. If the booking is attached to a real form and a real contact, LinkyCal is the one that covers all three.",
  },

  jotform: {
    slug: "jotform",
    competitor: "Jotform",
    seoTitle: "Jotform Alternative",
    seoDescription:
      "A Jotform alternative that keeps the form power you need and drops the clutter, with built-in scheduling and a contacts CRM.",
    eyebrow: "The Jotform alternative",
    headline: "Spend more time on your business,",
    highlightedHeadline: "not your form builder.",
    subcopy:
      "Jotform can do almost anything, and you can feel it. Menus inside menus, widgets you will never use, a builder that takes a while to learn. LinkyCal keeps the parts you actually reach for, clean multi-step forms, real scheduling, and a contact list, in a tool that does not make you hunt.",
    checkmarks: [
      "A builder you learn in minutes",
      "Scheduling built in",
      "Contacts and workflows included",
    ],
    HeroVisual: MockFormBuilderUI,
    intro:
      "Jotform grew by adding everything. That is great until you just want to ship a form, take a booking, and follow up, and you are three settings pages deep looking for the one toggle. LinkyCal is the trimmed down version of that idea, the forms and scheduling most people need, without the museum of features around them.",
    rows: [
      { label: "Multi-step forms with logic", linkycal: true, competitor: true },
      { label: "Native HTML & headless API", linkycal: true, competitor: "Limited" },
      { label: "Scheduling & booking pages", linkycal: true, competitor: "Add-on field" },
      { label: "Contacts CRM with tags", linkycal: true, competitor: false },
      { label: "Built-in workflows", linkycal: true, competitor: "Partial" },
      { label: "Google Calendar sync", linkycal: true, competitor: "Limited" },
      { label: "Free plan to start", linkycal: true, competitor: true },
    ],
    reasons: [
      {
        Icon: FileText,
        title: "A builder you learn in minutes",
        body: "Multi-step forms with logic, laid out so you are not searching for the option you want. Less surface, more shipping.",
      },
      {
        Icon: CalendarCheck,
        title: "Scheduling that belongs here",
        body: "Booking pages and calendar sync are part of the product, not a field type bolted on. Your intake and your calendar are one flow.",
      },
      {
        Icon: Users,
        title: "Contacts and follow-up included",
        body: "Every submission can build a contact, add a tag, and trigger a workflow, so leads move forward instead of piling up.",
      },
    ],
    faqs: [
      {
        question: "Can I rebuild my Jotform forms here?",
        answer:
          "Yes. Recreate them in the builder or POST from your own HTML. Most forms move over in a single sitting.",
      },
      {
        question: "Do I lose conditional logic?",
        answer:
          "No. Steps and conditional fields are built in, so the smart parts of your form come with you.",
      },
      {
        question: "Is scheduling really included?",
        answer:
          "Yes, booking pages and Google Calendar sync ship in the same project, no extra add-on.",
      },
    ],
    closing:
      "Jotform is the everything store. LinkyCal is the shop that already has what you came in for, forms, scheduling, and contacts, ready to go.",
  },

  "cal-com": {
    slug: "cal-com",
    competitor: "Cal.com",
    seoTitle: "Cal.com Alternative",
    seoDescription:
      "A Cal.com alternative with headless scheduling over REST, plus multi-step forms and a contacts CRM in the same API, hosted for you.",
    eyebrow: "The Cal.com alternative",
    headline: "A free, managed, headless scheduling API,",
    highlightedHeadline: "for the agent era.",
    subcopy:
      "Cal.com gives developers a flexible booking layer, and that is a real strength. What it does not bring is a form builder or a place to keep your contacts. LinkyCal gives you headless scheduling that is just as API friendly, plus multi-step forms and a contact list, so you are not stitching three projects together.",
    checkmarks: [
      "Headless booking over REST",
      "Forms in the same backend",
      "Hosted, no self hosting",
    ],
    HeroVisual: MockBookingUI,
    intro:
      "If you picked Cal.com, you probably care about owning the flow and hitting an API. Good news, so do we. The difference is that LinkyCal does not stop at scheduling. The same API that books a meeting also posts a form and updates a contact, so your integration is one surface instead of three.",
    rows: [
      { label: "Booking & availability", linkycal: true, competitor: true },
      { label: "Headless scheduling API", linkycal: true, competitor: true },
      { label: "Google Calendar sync", linkycal: true, competitor: true },
      { label: "Multi-step form builder", linkycal: true, competitor: false },
      { label: "Contacts CRM with tags", linkycal: true, competitor: false },
      { label: "Hosted, no self hosting", linkycal: true, competitor: "Self host or paid" },
      { label: "One API for forms + scheduling", linkycal: true, competitor: false },
    ],
    reasons: [
      {
        Icon: Code2,
        title: "Headless scheduling over REST",
        body: "Check availability and create bookings with plain HTTP requests, then build the booking UI yourself. The flexibility you wanted, without running the infrastructure if you do not want to.",
      },
      {
        Icon: FileText,
        title: "Forms in the same backend",
        body: "Multi-step forms with logic live right next to your event types, so the questions and the calendar share one project and one API key.",
      },
      {
        Icon: Users,
        title: "Contacts that fill themselves",
        body: "Bookings and form submissions build a tagged contact list automatically, which Cal.com leaves to you and another tool.",
      },
    ],
    faqs: [
      {
        question: "Is the scheduling API as flexible?",
        answer:
          "Yes. Availability checks and booking creation are public REST endpoints, so you can drive the whole flow from your own frontend.",
      },
      {
        question: "Do I have to self host?",
        answer:
          "No. LinkyCal is hosted on Cloudflare, so you get the headless control without running the infrastructure yourself.",
      },
      {
        question: "Can I add forms to a booking?",
        answer:
          "Yes, attach a form to an event type or run forms on their own. They share the same project and contacts.",
      },
    ],
    closing:
      "Cal.com is a strong booking layer. LinkyCal is a booking layer with forms and contacts already attached, on an API you can build on.",
  },

  "google-forms": {
    slug: "google-forms",
    competitor: "Google Forms",
    seoTitle: "Google Forms Alternative",
    seoDescription:
      "A Google Forms alternative with branded multi-step forms, built-in scheduling, and a contacts CRM, so a response can turn into a booked call.",
    eyebrow: "The Google Forms alternative",
    headline: "Finally,",
    highlightedHeadline: "a proper form.",
    subcopy:
      "Google Forms is everywhere because it is free and quick. It also looks free and quick, lives apart from your brand, and cannot book a meeting to save its life. LinkyCal keeps the easy part and adds forms that match your site, real scheduling, and a contact list that is not just a spreadsheet.",
    checkmarks: [
      "Forms that match your brand",
      "Scheduling built in",
      "Responses become contacts",
    ],
    HeroVisual: MockFormBuilderUI,
    intro:
      "Google Forms is the tool you reach for when you need something in two minutes. The trouble is that the form sits on a Google page, the answers land in a sheet, and nothing happens next. LinkyCal keeps the two minute setup and gives the form a home on your own site, a booking step, and a contact record for every response.",
    rows: [
      { label: "Branded, on your own domain", linkycal: true, competitor: false },
      { label: "Multi-step forms with logic", linkycal: true, competitor: "Basic" },
      { label: "Scheduling & booking pages", linkycal: true, competitor: false },
      { label: "Contacts CRM with tags", linkycal: true, competitor: false },
      { label: "Headless forms API", linkycal: true, competitor: false },
      { label: "Built-in workflows", linkycal: true, competitor: false },
      { label: "Free plan to start", linkycal: true, competitor: true },
    ],
    reasons: [
      {
        Icon: FileText,
        title: "Forms that match your brand",
        body: "Multi-step forms with your colors and logo, embedded on your own site or hosted on your project URL. No more sending people to a generic Google page.",
      },
      {
        Icon: CalendarCheck,
        title: "Book the meeting, do not just ask about it",
        body: "Add scheduling so a response can turn into a booked call on the spot, something Google Forms simply cannot do.",
      },
      {
        Icon: Users,
        title: "Every response becomes a contact",
        body: "Instead of a row in a sheet, each submission creates a contact you can tag, follow up with, and run workflows on.",
      },
    ],
    faqs: [
      {
        question: "Is LinkyCal free as well?",
        answer:
          "Yes, there is a free plan, so you can replace a Google Form without paying to get started.",
      },
      {
        question: "Can I embed it on my own site?",
        answer:
          "Yes. Drop in a script tag or POST from plain HTML, so the form lives on your domain, not a Google page.",
      },
      {
        question: "Where do responses go?",
        answer:
          "Into LinkyCal as contacts and submissions, ready for export, tagging, and workflows, instead of only a spreadsheet.",
      },
    ],
    closing:
      "For a quick internal poll, Google Forms is fine. For anything a customer sees, or anything that should lead to a meeting, LinkyCal is the upgrade.",
  },
};

/* ─── Pieces ──────────────────────────────────────────────────────────────── */

interface CompareCellProps {
  value: boolean | string;
  strong?: boolean;
}

function CompareCell({ value, strong }: CompareCellProps) {
  if (typeof value === "string") {
    return (
      <span
        className={cn(
          "text-xs font-medium leading-tight text-center",
          strong ? "text-brand" : "text-muted-foreground",
        )}
      >
        {value}
      </span>
    );
  }

  if (value) {
    return (
      <span
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center",
          strong ? "bg-brand text-white" : "bg-brand/10 text-brand",
        )}
      >
        <Check className="w-4 h-4" />
      </span>
    );
  }

  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center bg-foreground/5 text-foreground/30">
      <X className="w-4 h-4" />
    </span>
  );
}

function AltFaqItem({ question, answer }: AltFaq) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#F3F6F4] rounded-[20px] px-6">
      <button
        type="button"
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
      {open && (
        <p className="text-[15px] text-muted-foreground leading-relaxed pb-5 -mt-1">
          {answer}
        </p>
      )}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function AlternativePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const data = slug ? ALTERNATIVES[slug] : undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const onGetStarted = useCallback(() => {
    navigate("/?show_auth=true");
  }, [navigate]);

  if (!data) {
    return <Navigate to="/" replace />;
  }

  const HeroVisual = data.HeroVisual;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
      <SEOHead
        title={data.seoTitle}
        description={data.seoDescription}
        canonical={`https://linkycal.com/alternatives/${data.slug}`}
      />

      <MarketingNav onGetStarted={onGetStarted} />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative isolate pt-28 pb-20 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(45,106,79,0.04) 55%, rgba(45,106,79,0.07) 100%), radial-gradient(110% 70% at 18% 0%, rgba(45,106,79,0.09), transparent 55%)",
          }}
        />
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

        <div className="max-w-7xl mx-auto px-6 relative pt-10">
          <div className="flex flex-col lg:flex-row lg:items-center gap-12 xl:gap-16">
            <div className="max-w-4xl lg:flex-1 lg:min-w-0">
              <div className="text-sm font-medium text-brand uppercase tracking-wider mb-4">
                {data.eyebrow}
              </div>
              <h1 className="font-heading text-[2.75rem] sm:text-[3.5rem] xl:text-[4rem] font-medium tracking-tight leading-[1.06] text-balance">
                {data.headline}{" "}
                <span className="text-brand">{data.highlightedHeadline}</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mt-5 mb-8">
                {data.subcopy}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={onGetStarted}
                  className="glow-surface rounded-full h-12 px-8 text-sm font-medium inline-flex items-center justify-center gap-2"
                >
                  Start free
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#pricing"
                  className="glow-surface-subtle rounded-full h-12 px-6 text-sm font-medium inline-flex items-center justify-center text-foreground"
                >
                  See pricing
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6 text-sm font-medium text-foreground">
                {data.checkmarks.map((mark) => (
                  <span key={mark} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-brand" />
                    {mark}
                  </span>
                ))}
              </div>
            </div>

            <div className="hidden lg:block w-[26rem] xl:w-[30rem] shrink-0">
              <HeroVisual />
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison table ────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-heading text-[2.25rem] sm:text-[2.75rem] font-bold tracking-[-0.03em] leading-[1.05] text-foreground text-center text-balance mb-12">
            LinkyCal vs {data.competitor}
          </h2>

          <div className="space-y-2.5">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-3 px-5 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Feature
              </span>
              <span className="text-center text-sm font-bold text-brand">
                LinkyCal
              </span>
              <span className="text-center text-sm font-semibold text-foreground/70">
                {data.competitor}
              </span>
            </div>

            {data.rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[1.5fr_1fr_1fr] gap-3 items-center rounded-[16px] bg-[#F3F6F4] px-5 py-3.5"
              >
                <span className="text-sm font-medium text-foreground">
                  {row.label}
                </span>
                <div className="flex justify-center">
                  <CompareCell value={row.linkycal} strong />
                </div>
                <div className="flex justify-center">
                  <CompareCell value={row.competitor} />
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground/70 text-center mt-5">
            Based on each product&rsquo;s public plans and docs. Features change,
            so check their latest if you are unsure.
          </p>
        </div>
      </section>

      {/* ── Why switch ──────────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-24 px-6 bg-[#FBFCFB]">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-heading text-[2.25rem] sm:text-[2.75rem] font-bold tracking-[-0.03em] leading-[1.05] text-foreground text-balance">
              Why people switch from {data.competitor}
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mt-6">
              {data.intro}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-14">
            {data.reasons.map((reason) => (
              <div
                key={reason.title}
                className="rounded-[20px] bg-white border border-border/50 p-7 shadow-[0_18px_40px_-30px_rgba(15,26,20,0.4)]"
              >
                <div className="w-11 h-11 rounded-[14px] bg-[#0F1A14] text-white flex items-center justify-center mb-5">
                  <reason.Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {reason.title}
                </h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  {reason.body}
                </p>
              </div>
            ))}
          </div>

          <p className="text-center text-base sm:text-lg font-medium text-foreground max-w-2xl mx-auto mt-14 text-balance">
            {data.closing}
          </p>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <PricingSection onGetStarted={onGetStarted} />

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-heading text-[2.25rem] sm:text-[2.75rem] font-bold tracking-[-0.03em] leading-[1.05] text-foreground text-center text-balance mb-12">
            Moving from {data.competitor}
          </h2>
          <div className="space-y-3">
            {data.faqs.map((faq) => (
              <AltFaqItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
          </div>
        </div>
      </section>

      <FinalCtaSection onGetStarted={onGetStarted} />
      <MarketingFooter />
    </div>
  );
}
