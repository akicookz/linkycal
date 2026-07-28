import { expect, test } from "bun:test";

import {
  buildWorkflowVariableGroups,
} from "../src/lib/workflow-variables";

test("later workflow steps can select every latest and named AI research value", () => {
  const groups = buildWorkflowVariableGroups({
    priorSteps: [
      {
        type: "ai_research",
        label: "Lead research",
        resultKey: "Lead Research",
      },
      {
        type: "ai_research",
        label: "Risk research",
        resultKey: "Risk Scan",
      },
    ],
  });

  const latestResearch = groups.find(
    (group) => group.group === "Research",
  );
  expect(latestResearch?.items.map((item) => item.key)).toEqual([
    "research.summary",
    "research.company",
    "research.role",
    "research.website",
    "research.linkedinUrl",
    "research.location",
    "research.description",
    "research.companySize",
    "research.estimatedRevenue",
    "research.recommendedTags",
    "research.insights",
    "research.sources",
    "research.recommendedTagsText",
    "research.insightsText",
    "research.sourcesText",
    "research.sourcesHtml",
    "research.reportText",
    "research.reportHtml",
  ]);

  const namedResearch = groups.find(
    (group) => group.group === "Research (by key)",
  );
  const namedKeys = namedResearch?.items.map((item) => item.key) ?? [];
  expect(namedKeys).toContain(
    "research.byKey.lead_research.result.description",
  );
  expect(namedKeys).toContain(
    "research.byKey.lead_research.result.companySize",
  );
  expect(namedKeys).toContain(
    "research.byKey.lead_research.result.estimatedRevenue",
  );
  expect(namedKeys).toContain(
    "research.byKey.lead_research.result.recommendedTags",
  );
  expect(namedKeys).toContain(
    "research.byKey.lead_research.result.insights",
  );
  expect(namedKeys).toContain(
    "research.byKey.lead_research.result.sources",
  );
  expect(namedKeys).toContain(
    "research.byKey.lead_research.sourcesText",
  );
  expect(namedKeys).toContain(
    "research.byKey.lead_research.reportHtml",
  );
  expect(namedKeys.some((key) => key.includes("Lead Research"))).toBe(false);
});
