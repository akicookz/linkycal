import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type {
  AnalyticsIntegrationConfig,
  AnalyticsIntegrations,
  ConfigureAnalyticsIntegrationInput,
} from "../../shared/funnel-analytics";
import * as dbSchema from "../db/schema";
import { resolveProjectEntitlements } from "../lib/entitlements";
import type { EntitlementModeEnv } from "../lib/entitlement-mode";
import { publicFeatureDecision } from "../lib/public-entitlements";
import { configureAnalyticsIntegrationSchema } from "../validation";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseProjectSettings(
  value: unknown,
): Record<string, unknown> {
  if (isRecord(value)) return { ...value };
  if (typeof value !== "string" || !value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

function validGa4MeasurementId(value: unknown): string | undefined {
  return typeof value === "string" && /^G-[A-Z0-9]{4,20}$/.test(value)
    ? value
    : undefined;
}

function validMetaPixelId(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{5,30}$/.test(value)
    ? value
    : undefined;
}

function validPostHogProjectKey(value: unknown): string | undefined {
  return typeof value === "string" &&
      /^phc_[A-Za-z0-9_-]{10,200}$/.test(value)
    ? value
    : undefined;
}

export function normalizeAnalyticsIntegrations(
  value: unknown,
): AnalyticsIntegrations {
  const record = isRecord(value) ? value : {};
  const ga4 = isRecord(record.ga4) ? record.ga4 : {};
  const metaPixel = isRecord(record.meta_pixel) ? record.meta_pixel : {};
  const posthog = isRecord(record.posthog) ? record.posthog : {};

  const measurementId = validGa4MeasurementId(ga4.measurementId);
  const pixelId = validMetaPixelId(metaPixel.pixelId);
  const projectKey = validPostHogProjectKey(posthog.projectKey);
  const host = posthog.host === "eu" ? "eu" : "us";

  return {
    ga4: {
      enabled: ga4.enabled === true && !!measurementId,
      ...(measurementId ? { measurementId } : {}),
    },
    meta_pixel: {
      enabled: metaPixel.enabled === true && !!pixelId,
      ...(pixelId ? { pixelId } : {}),
    },
    posthog: {
      enabled: posthog.enabled === true && !!projectKey,
      ...(projectKey ? { projectKey } : {}),
      host,
    },
  };
}

export function stripAnalyticsIntegrationsFromSettings(
  value: unknown,
): Record<string, unknown> {
  const settings = parseProjectSettings(value);
  delete settings.analyticsIntegrations;
  return settings;
}

export function mergeProjectSettingsPreservingAnalyticsIntegrations(
  currentValue: unknown,
  nextValue: unknown,
): Record<string, unknown> {
  const current = parseProjectSettings(currentValue);
  const next = parseProjectSettings(nextValue);
  delete next.analyticsIntegrations;
  if (Object.hasOwn(current, "analyticsIntegrations")) {
    next.analyticsIntegrations = current.analyticsIntegrations;
  }
  return next;
}

function asConfigList(
  integrations: AnalyticsIntegrations,
): AnalyticsIntegrationConfig[] {
  return [
    { provider: "ga4", ...integrations.ga4 },
    { provider: "meta_pixel", ...integrations.meta_pixel },
    { provider: "posthog", ...integrations.posthog },
  ];
}

function requireEnabledIdentifier(
  input: ConfigureAnalyticsIntegrationInput,
): void {
  if (!input.enabled) return;
  if (input.provider === "ga4" && !input.measurementId) {
    throw new Error("A GA4 measurement ID is required when enabled");
  }
  if (input.provider === "meta_pixel" && !input.pixelId) {
    throw new Error("A Meta Pixel ID is required when enabled");
  }
  if (input.provider === "posthog" && !input.projectKey) {
    throw new Error("A PostHog project key is required when enabled");
  }
}

export class AnalyticsIntegrationService {
  constructor(private readonly db: AppDatabase) {}

  async list(projectId: string): Promise<AnalyticsIntegrationConfig[] | null> {
    const [project] = await this.db
      .select({ settings: dbSchema.projects.settings })
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, projectId))
      .limit(1);
    if (!project) return null;

    const settings = parseProjectSettings(project.settings);
    return asConfigList(
      normalizeAnalyticsIntegrations(settings.analyticsIntegrations),
    );
  }

  async configure(
    projectId: string,
    rawInput: unknown,
  ): Promise<AnalyticsIntegrationConfig | null> {
    const input = configureAnalyticsIntegrationSchema.parse(rawInput);
    const [project] = await this.db
      .select({ settings: dbSchema.projects.settings })
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, projectId))
      .limit(1);
    if (!project) return null;

    const settings = parseProjectSettings(project.settings);
    const integrations = normalizeAnalyticsIntegrations(
      settings.analyticsIntegrations,
    );
    if (input.provider === "ga4") {
      const merged = { ...integrations.ga4, ...input };
      requireEnabledIdentifier(merged);
      integrations.ga4 = {
        enabled: merged.enabled,
        ...(merged.measurementId
          ? { measurementId: merged.measurementId }
          : {}),
      };
    } else if (input.provider === "meta_pixel") {
      const merged = { ...integrations.meta_pixel, ...input };
      requireEnabledIdentifier(merged);
      integrations.meta_pixel = {
        enabled: merged.enabled,
        ...(merged.pixelId ? { pixelId: merged.pixelId } : {}),
      };
    } else {
      const merged = { ...integrations.posthog, ...input };
      requireEnabledIdentifier(merged);
      integrations.posthog = {
        enabled: merged.enabled,
        ...(merged.projectKey ? { projectKey: merged.projectKey } : {}),
        host: merged.host ?? "us",
      };
    }

    settings.analyticsIntegrations = integrations;
    await this.db
      .update(dbSchema.projects)
      .set({ settings: JSON.stringify(settings) })
      .where(eq(dbSchema.projects.id, projectId));

    return asConfigList(integrations).find(function matchesProvider(config) {
      return config.provider === input.provider;
    }) ?? null;
  }

  async getPublished(
    projectId: string,
    env?: EntitlementModeEnv,
  ): Promise<AnalyticsIntegrationConfig[]> {
    const entitlements = await resolveProjectEntitlements(this.db, projectId);
    if (
      !entitlements ||
      !publicFeatureDecision(
        entitlements,
        projectId,
        "analytics",
        env,
        "public_analytics_integrations",
      ).allowed
    ) return [];

    const integrations = await this.list(projectId);
    return (integrations ?? []).filter(function isEnabled(config) {
      return config.enabled;
    });
  }
}
