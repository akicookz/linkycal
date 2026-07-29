import { expect, test } from "bun:test";

import {
  writeFormCheckpointAnalytics,
  writeFormStartedAnalytics,
} from "../worker/lib/form-analytics";
import { submitFormStepSchema } from "../worker/validation";

interface CapturedDataPoint {
  indexes?: string[];
  blobs?: string[];
  doubles?: number[];
}

function createDataset(captured: CapturedDataPoint[]): AnalyticsEngineDataset {
  return {
    writeDataPoint: function writeDataPoint(point: CapturedDataPoint) {
      captured.push(point);
    },
  } as unknown as AnalyticsEngineDataset;
}

const correlation = {
  journeyId: "123e4567-e89b-42d3-a456-426614174000",
  funnelType: "form",
  source: "widget",
  deviceType: "mobile",
  stageKey: "field-company",
  stageLabel: "Company",
  stageKind: "question",
  stageOrder: 3,
} as const;

test("form analytics correlation is strict and remains separate from submitted fields", () => {
  const parsed = submitFormStepSchema.parse({
    fields: [{ fieldId: "company", value: "Northstar Oy" }],
    complete: true,
    analytics: correlation,
  });
  expect(parsed.fields).toEqual([
    { fieldId: "company", value: "Northstar Oy" },
  ]);
  expect(parsed.analytics).toEqual(correlation);
  expect(
    submitFormStepSchema.safeParse({
      fields: [],
      analytics: {
        ...correlation,
        email: "guest@example.com",
      },
    }).success,
  ).toBe(false);
});

test("successful form persistence writes correlated stage and completion events only after success", () => {
  const captured: CapturedDataPoint[] = [];
  const dataset = createDataset(captured);

  writeFormStartedAnalytics(dataset, {
    projectId: "project-acme",
    resourceSlug: "lead-form",
    correlation,
    country: "KR",
    city: "Seoul",
  });
  writeFormCheckpointAnalytics(dataset, {
    projectId: "project-acme",
    resourceSlug: "lead-form",
    correlation,
    completed: true,
    country: "KR",
    city: "Seoul",
  });

  expect(captured.map(function toCanonicalColumns(point) {
    return {
      event: point.blobs?.[1],
      journeyId: point.blobs?.[13],
      funnelType: point.blobs?.[14],
      stageKey: point.blobs?.[15],
      stageLabel: point.blobs?.[16],
      stageKind: point.blobs?.[17],
      source: point.blobs?.[11],
      deviceType: point.blobs?.[19],
      stageOrder: point.doubles?.[1],
    };
  })).toEqual([
    {
      event: "form_started",
      journeyId: correlation.journeyId,
      funnelType: "form",
      stageKey: "form-started",
      stageLabel: "Form started",
      stageKind: "page",
      source: "widget",
      deviceType: "mobile",
      stageOrder: 1,
    },
    {
      event: "form_stage_completed",
      journeyId: correlation.journeyId,
      funnelType: "form",
      stageKey: "field-company",
      stageLabel: "Company",
      stageKind: "question",
      source: "widget",
      deviceType: "mobile",
      stageOrder: 3,
    },
    {
      event: "form_completed",
      journeyId: correlation.journeyId,
      funnelType: "form",
      stageKey: "form-complete",
      stageLabel: "Form completed",
      stageKind: "completion",
      source: "widget",
      deviceType: "mobile",
      stageOrder: 5,
    },
  ]);
  const serialized = JSON.stringify(captured);
  expect(serialized).not.toContain("Northstar Oy");
  expect(serialized).not.toContain("guest@example.com");
});
