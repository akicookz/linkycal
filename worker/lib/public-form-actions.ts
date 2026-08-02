import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import { FormService } from "../services/form-service";
import {
  AnalyticsIntegrationService,
  stripAnalyticsIntegrationsFromSettings,
} from "../services/analytics-integration-service";
import { submitFormStepSchema } from "../validation";
import { resolveProjectEntitlements } from "./entitlements";
import {
  getProjectUsageDecision,
  reserveProjectUsage,
} from "./metered-entitlements";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export async function loadPublicFormAction(
  db: AppDatabase,
  projectSlug: string,
  formSlug: string,
) {
  const [project] = await db
    .select({
      id: dbSchema.projects.id,
      name: dbSchema.projects.name,
      slug: dbSchema.projects.slug,
      settings: dbSchema.projects.settings,
    })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.slug, projectSlug))
    .limit(1);

  if (!project) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Form not found" },
    };
  }

  const form = await new FormService(db).getFullFormBySlug(
    project.id,
    formSlug,
  );
  if (!form || form.status !== "active") {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Form not found" },
    };
  }

  const entitlements = await resolveProjectEntitlements(db, project.id);
  const canHideBranding =
    entitlements?.subscription.plan === "pro" ||
    entitlements?.subscription.plan === "business";
  const analyticsIntegrations = await new AnalyticsIntegrationService(
    db,
  ).getPublished(project.id);

  return {
    ok: true as const,
    status: 200 as const,
    body: {
      form,
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        settings: stripAnalyticsIntegrationsFromSettings(project.settings),
      },
      canHideBranding,
      analyticsIntegrations,
    },
  };
}

export async function startPublicFormResponseAction(
  db: AppDatabase,
  projectId: string,
  formId: string,
  metadata?: Record<string, unknown>,
) {
  const decision = await getProjectUsageDecision({
    db,
    projectId,
    key: "formResponses",
  });
  if (!decision.allowed) {
    return {
      ok: false as const,
      status: 429 as const,
      body: {
        error: "This form is temporarily unavailable",
        code: "plan_usage_limit_reached" as const,
      },
    };
  }
  const response = await new FormService(db).createResponse(formId, metadata);
  return {
    ok: true as const,
    status: 201 as const,
    body: { response },
  };
}

export async function submitPublicFormStepAction(
  db: AppDatabase,
  responseId: string,
  stepIndex: number,
  rawBody: unknown,
) {
  const parsed = submitFormStepSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: "Invalid request" },
    };
  }

  const service = new FormService(db);
  const previous = await service.getResponseById(responseId);
  const response = await service.submitStep(
    responseId,
    stepIndex,
    parsed.data.fields,
    {
      complete: parsed.data.complete === true,
      clearedFieldIds: parsed.data.clearedFieldIds,
    },
  );
  if (!response) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Response not found" },
    };
  }

  if (
    previous?.status !== "completed" &&
    response.status === "completed" &&
    response.formId
  ) {
    const [form] = await db
      .select({ projectId: dbSchema.forms.projectId })
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.id, response.formId))
      .limit(1);
    if (form) {
      const reservation = await reserveProjectUsage({
        db,
        projectId: form.projectId,
        key: "formResponses",
        operationId: response.id,
        allowExistingOverage: true,
        channel: "public_form_completion",
      });
      await reservation.consume();
    }
  }

  return {
    ok: true as const,
    status: 200 as const,
    body: { response },
    analytics: parsed.data.analytics,
  };
}
