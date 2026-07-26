import { describe, expect, test } from "bun:test";

import {
  applyAiResearchDefaults,
  DEFAULT_AI_RESEARCH_PROMPT,
  seedAiResearchInputs,
} from "../src/lib/ai-research-defaults";

describe("AI Research defaults", () => {
  test("spells out the supplied contact fields and research targets", () => {
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.name}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.email}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.phone}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.notes}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("Company size");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("estimated revenue");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("LinkedIn");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("Do not infer unsupported facts");
  });

  test("seeds only contact fields and not a form response identifier", () => {
    expect(seedAiResearchInputs()).toEqual([
      { key: "name", source: { kind: "path", path: "contact.name" } },
      { key: "email", source: { kind: "path", path: "contact.email" } },
      { key: "phone", source: { kind: "path", path: "contact.phone" } },
      { key: "notes", source: { kind: "path", path: "contact.notes" } },
    ]);
  });

  test("fills an empty saved prompt but preserves an edited prompt", () => {
    expect(applyAiResearchDefaults({ prompt: "" }).prompt).toBe(
      DEFAULT_AI_RESEARCH_PROMPT,
    );
    expect(applyAiResearchDefaults({ prompt: "Use my rubric" }).prompt).toBe(
      "Use my rubric",
    );
  });
});
