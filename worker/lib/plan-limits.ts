import type { Plan, PlanLimits } from "../types";

// ─── Plan Limits ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxProjects: 1,
    maxFormsPerProject: 3,
    maxEventTypes: 3,
    maxContactsPerProject: 100,
    maxWorkflows: 1,
    calendarSync: true,
    maxCalendarConnections: 1,
    apiAccess: false,
    customWidgets: false,
    analytics: false,
    slugRedirects: false,
  },
  pro: {
    maxProjects: 5,
    maxFormsPerProject: 20,
    maxEventTypes: 20,
    maxContactsPerProject: 5000,
    maxWorkflows: 10,
    calendarSync: true,
    maxCalendarConnections: -1,
    apiAccess: true,
    customWidgets: false,
    analytics: true,
    slugRedirects: true,
  },
  business: {
    maxProjects: 20,
    maxFormsPerProject: -1,
    maxEventTypes: -1,
    maxContactsPerProject: -1,
    maxWorkflows: -1,
    calendarSync: true,
    maxCalendarConnections: -1,
    apiAccess: true,
    customWidgets: true,
    analytics: true,
    slugRedirects: true,
  },
};
