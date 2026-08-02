export type Plan = "free" | "pro" | "business";

export type EntitlementScope = "project" | "workspace";
export type EntitlementKind = "feature" | "resource" | "metered";
export type EntitlementStatus =
  | "available"
  | "warning"
  | "grace"
  | "blocked"
  | "unavailable";

export type EntitlementKey =
  | "projects"
  | "forms"
  | "eventTypes"
  | "contacts"
  | "workflows"
  | "calendarConnections"
  | "teamMembers"
  | "formResponses"
  | "bookings"
  | "workflowExecutions"
  | "transactionalEmails"
  | "integrationRequests"
  | "enrichments"
  | "storageBytes"
  | "analytics"
  | "analyticsRetentionMonths"
  | "widgets"
  | "themeOverrides"
  | "apiAccess"
  | "mcpAccess"
  | "customCss"
  | "removeBranding";

export type PlanFeatureGroup =
  | "capacity"
  | "automation"
  | "integrations"
  | "customization"
  | "collaborationAnalytics";

export interface EntitlementMetadata {
  key: EntitlementKey;
  label: string;
  kind: EntitlementKind;
  scope: EntitlementScope;
  group: PlanFeatureGroup;
  grace: boolean;
  unit: "count" | "bytes" | "months" | "boolean";
}

export interface PlanEntitlementValue {
  enabled: boolean;
  limit: number | null;
}

export interface PlanDefinition {
  id: Plan;
  name: string;
  description: string;
  badge: string | null;
  highlighted: boolean;
  prices: {
    monthly: number;
    annualMonthly: number;
    annualTotal: number;
  };
  entitlements: Record<EntitlementKey, PlanEntitlementValue>;
}

export interface PlanComparisonGroup {
  id: PlanFeatureGroup;
  label: string;
  keys: EntitlementKey[];
}

export interface EntitlementDecision {
  key: EntitlementKey;
  kind: EntitlementKind;
  scope: EntitlementScope;
  enabled: boolean;
  allowed: boolean;
  status: EntitlementStatus;
  used: number | null;
  limit: number | null;
  hardLimit: number | null;
  periodStart: string | null;
  resetAt: string | null;
  recommendedPlan: "pro" | "business" | null;
}

export const PLAN_ORDER: Plan[] = ["free", "pro", "business"];

export const ENTITLEMENT_METADATA: Record<
  EntitlementKey,
  EntitlementMetadata
> = {
  projects: metadata("projects", "Projects", "resource", "workspace", "capacity"),
  forms: metadata("forms", "Forms per project", "resource", "project", "capacity"),
  eventTypes: metadata("eventTypes", "Event types per project", "resource", "project", "capacity"),
  contacts: metadata("contacts", "Contacts per project", "resource", "project", "capacity"),
  workflows: metadata("workflows", "Workflows per project", "resource", "project", "automation"),
  calendarConnections: metadata("calendarConnections", "Calendar connections", "resource", "workspace", "integrations"),
  teamMembers: metadata("teamMembers", "Team members", "resource", "workspace", "collaborationAnalytics"),
  formResponses: metadata("formResponses", "Form responses per month", "metered", "workspace", "capacity", true),
  bookings: metadata("bookings", "Bookings", "metered", "workspace", "capacity", false),
  workflowExecutions: metadata("workflowExecutions", "Workflow executions per month", "metered", "workspace", "automation", true),
  transactionalEmails: metadata("transactionalEmails", "Transactional emails per month", "metered", "workspace", "automation", true),
  integrationRequests: metadata("integrationRequests", "API + MCP requests per month", "metered", "workspace", "integrations", true),
  enrichments: metadata("enrichments", "Enrichments per month", "metered", "workspace", "automation", true),
  storageBytes: metadata("storageBytes", "Storage", "metered", "workspace", "capacity", true, "bytes"),
  analytics: metadata("analytics", "Analytics", "feature", "workspace", "collaborationAnalytics", false, "boolean"),
  analyticsRetentionMonths: metadata("analyticsRetentionMonths", "Analytics history", "feature", "workspace", "collaborationAnalytics", false, "months"),
  widgets: metadata("widgets", "Form and booking widgets", "feature", "workspace", "customization", false, "boolean"),
  themeOverrides: metadata("themeOverrides", "Theme overrides", "feature", "workspace", "customization", false, "boolean"),
  apiAccess: metadata("apiAccess", "REST API access", "feature", "workspace", "integrations", false, "boolean"),
  mcpAccess: metadata("mcpAccess", "MCP access", "feature", "workspace", "integrations", false, "boolean"),
  customCss: metadata("customCss", "Custom CSS", "feature", "workspace", "customization", false, "boolean"),
  removeBranding: metadata("removeBranding", "Remove LinkyCal branding", "feature", "workspace", "customization", false, "boolean"),
};

export const PLAN_COMPARISON_GROUPS: PlanComparisonGroup[] = [
  {
    id: "capacity",
    label: "Capacity",
    keys: [
      "projects",
      "forms",
      "eventTypes",
      "contacts",
      "formResponses",
      "bookings",
      "storageBytes",
    ],
  },
  {
    id: "automation",
    label: "Automation",
    keys: [
      "workflows",
      "workflowExecutions",
      "transactionalEmails",
      "enrichments",
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    keys: [
      "calendarConnections",
      "apiAccess",
      "mcpAccess",
      "integrationRequests",
    ],
  },
  {
    id: "customization",
    label: "Customization",
    keys: ["widgets", "themeOverrides", "customCss", "removeBranding"],
  },
  {
    id: "collaborationAnalytics",
    label: "Collaboration & analytics",
    keys: ["teamMembers", "analytics", "analyticsRetentionMonths"],
  },
];

export const PLAN_CATALOG: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "For personal projects and getting started.",
    badge: null,
    highlighted: false,
    prices: { monthly: 0, annualMonthly: 0, annualTotal: 0 },
    entitlements: entitlements({
      projects: value(1),
      forms: value(3),
      eventTypes: value(3),
      contacts: value(500),
      workflows: value(1),
      calendarConnections: value(1),
      teamMembers: value(0, false),
      formResponses: value(500),
      bookings: value(null),
      workflowExecutions: value(250),
      transactionalEmails: value(500),
      integrationRequests: value(10_000),
      enrichments: value(5),
      storageBytes: value(500_000_000),
      analytics: feature(false),
      analyticsRetentionMonths: value(0, false),
      widgets: feature(true),
      themeOverrides: feature(true),
      apiAccess: feature(true),
      mcpAccess: feature(true),
      customCss: feature(false),
      removeBranding: feature(false),
    }),
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For growing businesses with more volume and automation.",
    badge: "Most popular",
    highlighted: true,
    prices: { monthly: 29, annualMonthly: 24, annualTotal: 288 },
    entitlements: entitlements({
      projects: value(5),
      forms: value(20),
      eventTypes: value(20),
      contacts: value(5_000),
      workflows: value(10),
      calendarConnections: value(null),
      teamMembers: value(null),
      formResponses: value(10_000),
      bookings: value(null),
      workflowExecutions: value(5_000),
      transactionalEmails: value(10_000),
      integrationRequests: value(100_000),
      enrichments: value(50),
      storageBytes: value(10_000_000_000),
      analytics: feature(true),
      analyticsRetentionMonths: value(12),
      widgets: feature(true),
      themeOverrides: feature(true),
      apiAccess: feature(true),
      mcpAccess: feature(true),
      customCss: feature(true),
      removeBranding: feature(true),
    }),
  },
  business: {
    id: "business",
    name: "Business",
    description: "For teams that need higher capacity and longer insights.",
    badge: null,
    highlighted: false,
    prices: { monthly: 99, annualMonthly: 82, annualTotal: 984 },
    entitlements: entitlements({
      projects: value(20),
      forms: value(null),
      eventTypes: value(null),
      contacts: value(10_000),
      workflows: value(null),
      calendarConnections: value(null),
      teamMembers: value(null),
      formResponses: value(50_000),
      bookings: value(null),
      workflowExecutions: value(25_000),
      transactionalEmails: value(50_000),
      integrationRequests: value(1_000_000),
      enrichments: value(100),
      storageBytes: value(50_000_000_000),
      analytics: feature(true),
      analyticsRetentionMonths: value(36),
      widgets: feature(true),
      themeOverrides: feature(true),
      apiAccess: feature(true),
      mcpAccess: feature(true),
      customCss: feature(true),
      removeBranding: feature(true),
    }),
  },
};

export function getPlanDefinition(plan: Plan): PlanDefinition {
  return PLAN_CATALOG[plan];
}

function metadata(
  key: EntitlementKey,
  label: string,
  kind: EntitlementKind,
  scope: EntitlementScope,
  group: PlanFeatureGroup,
  grace = false,
  unit: EntitlementMetadata["unit"] = "count",
): EntitlementMetadata {
  return { key, label, kind, scope, group, grace, unit };
}

function value(
  limit: number | null,
  enabled = true,
): PlanEntitlementValue {
  return { enabled, limit };
}

function feature(enabled: boolean): PlanEntitlementValue {
  return { enabled, limit: null };
}

function entitlements(
  input: Record<EntitlementKey, PlanEntitlementValue>,
): Record<EntitlementKey, PlanEntitlementValue> {
  return input;
}
