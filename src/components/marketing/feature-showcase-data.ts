import type { ReactNode } from "react";
import {
  MockFormBuilderUI,
  MockBookingUI,
  MockContactCrmUI,
  MockApiUI,
  MockWorkflowUI,
} from "./FeatureMocks";

export interface FeatureShowcaseCapability {
  title: string;
  description: string;
}

export interface FeatureShowcaseItem {
  id: string;
  pageSlug: string;
  railLabel: string;
  eyebrow: string;
  title: string;
  highlightedTitle?: string;
  description: string;
  capabilities: FeatureShowcaseCapability[];
  DemoComponent: () => ReactNode;
}

export const featureShowcaseItems: FeatureShowcaseItem[] = [
  {
    id: "feature-scheduling",
    pageSlug: "scheduling",
    railLabel: "Scheduling",
    eyebrow: "Scheduling",
    title: "Branded scheduling links and widgets.",
    description:
      "Share booking pages and widgets that stay in sync with your calendar, handle timezones correctly, and confirm every slot the moment it is reserved.",
    capabilities: [
      {
        title: "Google Calendar sync",
        description:
          "Block busy time automatically and surface live availability.",
      },
      {
        title: "Buffer times",
        description:
          "Add breathing room before and after meetings without manual cleanup.",
      },
      {
        title: "Timezone aware",
        description:
          "Show the right local slot for every visitor without confusion.",
      },
      {
        title: "Confirmation emails",
        description:
          "Send booking details instantly once a slot is locked in.",
      },
    ],
    DemoComponent: MockBookingUI,
  },
  {
    id: "feature-forms",
    pageSlug: "forms",
    railLabel: "Forms",
    eyebrow: "Forms",
    title: "Build forms that adapt.",
    description:
      "Create multi-step flows that branch based on answers, collect files, and validate the right fields before anything gets submitted.",
    capabilities: [
      {
        title: "Conditional logic",
        description:
          "Reveal the next question from what the visitor already told you.",
      },
      {
        title: "File uploads",
        description:
          "Collect briefs, assets, and supporting documents in the same flow.",
      },
      {
        title: "Multi-step",
        description:
          "Break longer forms into short screens that are easier to finish.",
      },
      {
        title: "Validation",
        description:
          "Catch missing or malformed inputs before the response is stored.",
      },
    ],
    DemoComponent: MockFormBuilderUI,
  },
  {
    id: "feature-contacts",
    pageSlug: "contacts",
    railLabel: "Contacts",
    eyebrow: "Contacts",
    title: "Keep every contact organized.",
    description:
      "Turn every form response and booking into a contact record with tags, history, and enough context for your team to act immediately.",
    capabilities: [
      {
        title: "Auto-tagging",
        description:
          "Apply tags from answers, event type, or workflow branch automatically.",
      },
      {
        title: "Activity timeline",
        description:
          "See submissions, bookings, and follow-up actions in one stream.",
      },
      {
        title: "CSV import",
        description:
          "Bring existing contacts in without rebuilding your data manually.",
      },
      {
        title: "Smart search",
        description:
          "Filter people by tag, source, or recent activity in seconds.",
      },
    ],
    DemoComponent: MockContactCrmUI,
  },
  {
    id: "feature-workflows",
    pageSlug: "workflows",
    railLabel: "Workflows",
    eyebrow: "Workflows",
    title: "Automate the busywork.",
    description:
      "Trigger follow-ups from submissions and bookings, branch logic based on context, and keep repetitive post-submit tasks off your plate.",
    capabilities: [
      {
        title: "Email triggers",
        description:
          "Send confirmations, reminders, and follow-ups from one event.",
      },
      {
        title: "Tag automation",
        description:
          "Segment leads automatically as new activity comes in.",
      },
      {
        title: "Webhooks",
        description:
          "Push bookings and submissions into the tools you already use.",
      },
      {
        title: "Conditional logic",
        description:
          "Branch actions based on answers, timing, or event details.",
      },
    ],
    DemoComponent: MockWorkflowUI,
  },
  {
    id: "feature-api",
    pageSlug: "api",
    railLabel: "API",
    eyebrow: "API",
    title: "Let your agents",
    highlightedTitle: "handle everything.",
    description:
      "Expose the same scheduling, forms, and contact workflows through an API so custom apps and AI agents can do the work programmatically.",
    capabilities: [
      {
        title: "Check availability",
        description:
          "Query live scheduling windows before you show the next step.",
      },
      {
        title: "Create bookings",
        description:
          "Reserve slots directly from agents or custom application flows.",
      },
      {
        title: "Submit forms",
        description:
          "Post structured responses into your workflows without the widget.",
      },
      {
        title: "Manage contacts",
        description:
          "Read and update people records while your agents operate.",
      },
    ],
    DemoComponent: MockApiUI,
  },
];
