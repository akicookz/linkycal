import { describe, expect, test } from "bun:test";

import {
  applyAiResearchDefaults,
  DEFAULT_AI_RESEARCH_PROMPT,
} from "../src/lib/ai-research-defaults";

describe("AI Research defaults", () => {
  test("fills a blank prompt and preserves every nonempty edited prompt", () => {
    const whitespacePrompt = "\n  Use my rubric exactly.  \t\n";

    expect(applyAiResearchDefaults({ prompt: "" }).prompt).toBe(
      DEFAULT_AI_RESEARCH_PROMPT,
    );
    expect(applyAiResearchDefaults({ prompt: "Use my rubric" }).prompt).toBe(
      "Use my rubric",
    );
    expect(
      applyAiResearchDefaults({ prompt: whitespacePrompt }).prompt,
    ).toBe(whitespacePrompt);
  });
});
