import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { WorkflowResearchResult } from "../src/components/WorkflowResearchResult";
import { WorkflowStepLog } from "../src/components/WorkflowStepLog";

test("AI research run exposes every returned fact and source evidence", function () {
  render(
    <WorkflowStepLog
      stepType="ai_research"
      input={{ resultKey: "Lead Research" }}
      output={{
        summary: "Pedro is the founder of EVE BCN.",
        company: "EVE BCN",
        role: "Founder",
        website: "https://evebcn.com",
        linkedinUrl: "https://linkedin.com/in/pedro",
        location: "Barcelona, Spain",
        description: "Clinic scheduling infrastructure",
        companySize: "2–10 employees",
        estimatedRevenue: "€500K–€1M",
        recommendedTags: ["healthtech", "qualified"],
        insights: ["Small team with a high-touch sales process."],
        sources: [
          {
            title: "EVE BCN company profile",
            url: "https://evebcn.com/about",
            snippet: "Privately operated in Barcelona.",
          },
        ],
      }}
      error={null}
    />,
  );

  expect(screen.getByText("Clinic scheduling infrastructure")).toBeTruthy();
  expect(screen.getByText("2–10 employees")).toBeTruthy();
  expect(screen.getByText("€500K–€1M")).toBeTruthy();
  expect(screen.getByText("healthtech")).toBeTruthy();
  expect(screen.getByText("Small team with a high-touch sales process.")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /EVE BCN company profile/ }).getAttribute("href"),
  ).toBe("https://evebcn.com/about");
  expect(screen.getByText("Privately operated in Barcelona.")).toBeTruthy();
});

test("historical AI research still shows its summary and retained source count", function () {
  render(
    <WorkflowResearchResult
      value={{
        summary: "Historical research summary",
        sourceCount: 3,
      }}
    />,
  );

  expect(screen.getByText("Historical research summary")).toBeTruthy();
  expect(
    screen.getByText(
      "3 sources were used, but links were not stored for this historical result.",
    ),
  ).toBeTruthy();
});
