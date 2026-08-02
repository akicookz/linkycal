import {
  PLAN_CATALOG,
  PLAN_ORDER,
  type Plan,
} from "../../shared/plan-catalog";
import type { PlanLimits } from "../types";

// ─── Plan Limits ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<Plan, PlanLimits> = Object.fromEntries(
  PLAN_ORDER.map((plan) => [plan, toLegacyPlanLimits(plan)]),
) as Record<Plan, PlanLimits>;

export function toLegacyPlanLimits(plan: Plan): PlanLimits {
  const values = PLAN_CATALOG[plan].entitlements;
  return {
    maxProjects: legacyLimit(values.projects.limit),
    maxFormsPerProject: legacyLimit(values.forms.limit),
    maxEventTypes: legacyLimit(values.eventTypes.limit),
    maxContactsPerProject: legacyLimit(values.contacts.limit),
    maxWorkflows: legacyLimit(values.workflows.limit),
    calendarSync: values.calendarConnections.enabled,
    maxCalendarConnections: legacyLimit(values.calendarConnections.limit),
    maxTeamMembers: legacyLimit(values.teamMembers.limit),
    apiAccess: values.apiAccess.enabled,
    mcpAccess: values.mcpAccess.enabled,
    customCss: values.customCss.enabled,
    removeBranding: values.removeBranding.enabled,
    analytics: values.analytics.enabled,
    analyticsRetentionMonths: values.analyticsRetentionMonths.limit ?? 0,
    widgets: values.widgets.enabled,
    themeOverrides: values.themeOverrides.enabled,
    maxFormResponsesPerMonth: legacyLimit(values.formResponses.limit),
    maxBookingsPerMonth: legacyLimit(values.bookings.limit),
    maxWorkflowExecutionsPerMonth: legacyLimit(values.workflowExecutions.limit),
    maxTransactionalEmailsPerMonth: legacyLimit(values.transactionalEmails.limit),
    maxIntegrationRequestsPerMonth: legacyLimit(values.integrationRequests.limit),
    maxEnrichmentsPerMonth: legacyLimit(values.enrichments.limit),
    maxStorageBytes: legacyLimit(values.storageBytes.limit),
  };
}

function legacyLimit(value: number | null): number {
  return value ?? -1;
}
