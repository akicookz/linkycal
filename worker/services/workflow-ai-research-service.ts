import {
  createGoogleGenerativeAI,
  type GoogleLanguageModelOptions,
} from "@ai-sdk/google";
import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai";
import { Output, generateText, stepCountIs } from "ai";

import {
  slugifyWorkflowKey,
  workflowResearchResultSchema,
  type WorkflowResearchProvider,
  type WorkflowResearchRecord,
  type WorkflowResearchResult,
} from "../lib/workflow-runtime";
import type { AppEnv } from "../types";

export interface WorkflowAiResearchConfig {
  provider: WorkflowResearchProvider;
  prompt: string;
  resultKey?: string;
}

const CHATGPT_MODEL = "gpt-5.2";
const GEMINI_MODEL = "gemini-2.5-pro";

export class WorkflowAiResearchService {
  async execute(
    config: WorkflowAiResearchConfig,
    env: AppEnv,
  ): Promise<WorkflowResearchRecord> {
    const prompt = config.prompt.trim();
    if (!prompt) {
      throw new Error("ai_research: missing 'prompt' in config");
    }

    const provider = config.provider;
    const resultKey = slugifyWorkflowKey(config.resultKey);

    if (provider === "gemini") {
      return this.executeGeminiResearch(prompt, resultKey, env);
    }

    return this.executeChatGptResearch(prompt, resultKey, env);
  }

  private async executeChatGptResearch(
    prompt: string,
    resultKey: string,
    env: AppEnv,
  ): Promise<WorkflowResearchRecord> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("ai_research: research service is not configured");
    }

    const openai = createOpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    const result = await generateText({
      model: openai(CHATGPT_MODEL),
      prompt: buildResearchPrompt(prompt),
      output: Output.object({
        schema: workflowResearchResultSchema,
      }),
      tools: {
        web_search: openai.tools.webSearch({
          externalWebAccess: true,
          searchContextSize: "high",
        }),
      },
      toolChoice: { type: "tool", toolName: "web_search" },
      stopWhen: stepCountIs(3),
      providerOptions: {
        openai: {
          reasoningEffort: "medium",
          textVerbosity: "medium",
        } satisfies OpenAILanguageModelResponsesOptions,
      },
    });

    return buildResearchRecord({
      provider: "chatgpt",
      model: CHATGPT_MODEL,
      resultKey,
      prompt,
      output: withFallbackSources(result.output, result.sources),
    });
  }

  // Gemini rejects structured JSON output (`responseMimeType: application/json`)
  // combined with a grounding tool in the same call, so this runs two passes:
  // (1) grounded google_search producing text + sources, (2) a tool-free call
  // that structures that text into the schema.
  private async executeGeminiResearch(
    prompt: string,
    resultKey: string,
    env: AppEnv,
  ): Promise<WorkflowResearchRecord> {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("ai_research: GOOGLE_GENERATIVE_AI_API_KEY is not configured");
    }

    const google = createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    });

    // Pass 1 — grounded search. No `Output.object`; grounding is automatic when
    // the googleSearch tool is present, so we don't force toolChoice (forcing it
    // can starve the final text generation).
    const search = await generateText({
      model: google(GEMINI_MODEL),
      prompt: buildResearchPrompt(prompt),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      stopWhen: stepCountIs(3),
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 4096,
            includeThoughts: false,
          },
        } satisfies GoogleLanguageModelOptions,
      },
    });

    // If the grounded pass produced no text (e.g. it spent its step budget on
    // tool calls), structuring would silently yield an all-null result. Fail
    // instead so the caller's fallback/error handling kicks in.
    if (search.text.trim().length === 0) {
      throw new Error("ai_research: research service returned no findings");
    }

    // Pass 2 — structure the grounded findings into the schema. No tools, so the
    // JSON response format is allowed.
    const structured = await generateText({
      model: google(GEMINI_MODEL),
      prompt: buildStructurePrompt(search.text),
      output: Output.object({
        schema: workflowResearchResultSchema,
      }),
    });

    return buildResearchRecord({
      provider: "gemini",
      model: GEMINI_MODEL,
      resultKey,
      prompt,
      output: withFallbackSources(structured.output, search.sources),
    });
  }
}

// Second Gemini pass: turn grounded free-text findings into the typed schema.
function buildStructurePrompt(researchText: string): string {
  return [
    "Convert the following research notes into the required structured fields.",
    "Use only what the notes support; if a field is unknown, return null.",
    "Do not invent companies, roles, or URLs.",
    "Keep the summary concise and useful for a sales or operations workflow.",
    "",
    "Research notes:",
    researchText.trim().length > 0 ? researchText : "(no findings)",
  ].join("\n");
}

function buildResearchPrompt(userPrompt: string): string {
  return [
    "You are researching a contact for an automation workflow.",
    "Always use the available search tools before answering.",
    "Return factual, concise, structured research.",
    "If a field is unknown, return null.",
    "Do not invent companies, roles, or URLs.",
    "Focus on information that would help a sales or operations workflow decide what to do next.",
    "",
    "Research request:",
    userPrompt,
  ].join("\n");
}

function buildResearchRecord({
  provider,
  model,
  resultKey,
  prompt,
  output,
}: {
  provider: WorkflowResearchProvider;
  model: string;
  resultKey: string;
  prompt: string;
  output: WorkflowResearchResult;
}): WorkflowResearchRecord {
  return {
    provider,
    model,
    resultKey,
    prompt,
    executedAt: new Date().toISOString(),
    result: output,
  };
}

function withFallbackSources(
  output: WorkflowResearchResult,
  sdkSources: unknown[] | undefined,
): WorkflowResearchResult {
  if (output.sources.length > 0) {
    return output;
  }

  const fallbackSources = (sdkSources ?? [])
    .map((source) => normalizeSdkSource(source))
    .filter((source): source is WorkflowResearchResult["sources"][number] => source !== null);

  return {
    ...output,
    sources: fallbackSources,
  };
}

function normalizeSdkSource(
  source: unknown,
): WorkflowResearchResult["sources"][number] | null {
  if (
    typeof source === "object" &&
    source !== null &&
    "type" in source &&
    source.type === "url" &&
    "url" in source &&
    typeof source.url === "string"
  ) {
    return {
      title: "",
      url: source.url,
      snippet: null,
    };
  }

  return null;
}
