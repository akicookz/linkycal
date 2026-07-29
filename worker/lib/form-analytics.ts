import type { z } from "zod";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type { FunnelStageKind } from "../../shared/funnel-analytics";
import * as dbSchema from "../db/schema";
import { writeAnalyticsEvent } from "../services/analytics-service";
import { publicAnalyticsCorrelationSchema } from "../validation";

export type PublicAnalyticsCorrelation = z.infer<
  typeof publicAnalyticsCorrelationSchema
>;

interface FormAnalyticsInput {
  projectId: string;
  resourceSlug: string;
  correlation?: PublicAnalyticsCorrelation;
  country?: string;
  city?: string;
}

interface FormCheckpointAnalyticsInput extends FormAnalyticsInput {
  completed: boolean;
}

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export function parsePublicAnalyticsCorrelation(
  value: unknown,
): PublicAnalyticsCorrelation | undefined {
  const parsed = publicAnalyticsCorrelationSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function correlationFields(
  correlation: PublicAnalyticsCorrelation | undefined,
) {
  if (!correlation) return {};
  return {
    journeyId: correlation.journeyId,
    funnelType: correlation.funnelType,
    source: correlation.source,
    deviceType: correlation.deviceType,
  };
}

export function writeFormStartedAnalytics(
  analytics: AnalyticsEngineDataset,
  input: FormAnalyticsInput,
): void {
  writeAnalyticsEvent(analytics, {
    projectId: input.projectId,
    event: "form_started",
    resourceSlug: input.resourceSlug,
    country: input.country,
    city: input.city,
    ...correlationFields(input.correlation),
    ...(input.correlation
      ? {
          stageKey: "form-started",
          stageLabel: "Form started",
          stageKind: "page" as const,
          stageOrder: 1,
        }
      : {}),
  });
}

function hasStageIdentity(
  correlation: PublicAnalyticsCorrelation,
): correlation is PublicAnalyticsCorrelation & {
  stageKey: string;
  stageLabel: string;
  stageKind: FunnelStageKind;
  stageOrder: number;
} {
  return !!(
    correlation.stageKey &&
    correlation.stageLabel &&
    correlation.stageKind &&
    correlation.stageOrder
  );
}

export function writeFormCheckpointAnalytics(
  analytics: AnalyticsEngineDataset,
  input: FormCheckpointAnalyticsInput,
): void {
  if (input.correlation && hasStageIdentity(input.correlation)) {
    writeAnalyticsEvent(analytics, {
      projectId: input.projectId,
      event: "form_stage_completed",
      resourceSlug: input.resourceSlug,
      country: input.country,
      city: input.city,
      ...correlationFields(input.correlation),
      stageKey: input.correlation.stageKey,
      stageLabel: input.correlation.stageLabel,
      stageKind: input.correlation.stageKind,
      stageOrder: input.correlation.stageOrder,
      context: { stageOutcome: "completed" },
    });
  }

  if (!input.completed) return;
  writeAnalyticsEvent(analytics, {
    projectId: input.projectId,
    event: "form_completed",
    resourceSlug: input.resourceSlug,
    country: input.country,
    city: input.city,
    ...correlationFields(input.correlation),
    ...(input.correlation
      ? {
          stageKey: "form-complete",
          stageLabel: "Form completed",
          stageKind: "completion" as const,
          stageOrder: (input.correlation.stageOrder ?? 0) + 2,
        }
      : {}),
  });
}

export async function writePersistedFormCheckpointAnalytics(
  db: AppDatabase,
  analytics: AnalyticsEngineDataset,
  input: {
    formId: string;
    resourceSlug: string;
    correlation?: PublicAnalyticsCorrelation;
    completed: boolean;
    country?: string;
    city?: string;
  },
): Promise<void> {
  const [form] = await db
    .select({ projectId: dbSchema.forms.projectId })
    .from(dbSchema.forms)
    .where(eq(dbSchema.forms.id, input.formId))
    .limit(1);
  if (!form) return;

  writeFormCheckpointAnalytics(analytics, {
    projectId: form.projectId,
    resourceSlug: input.resourceSlug,
    correlation: input.correlation,
    completed: input.completed,
    country: input.country,
    city: input.city,
  });
}
