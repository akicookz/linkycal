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
  type WorkflowTriggerContext,
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
    context: WorkflowTriggerContext,
    env: AppEnv,
  ): Promise<WorkflowResearchRecord> {
    const prompt = config.prompt.trim();
    if (!prompt) {
      throw new Error("ai_research: missing 'prompt' in config");
    }

    const provider = config.provider;
    const resultKey = slugifyWorkflowKey(config.resultKey);

    if (provider === "gemini") {
      return this.executeGeminiResearch(prompt, resultKey, context, env);
    }

    return this.executeChatGptResearch(prompt, resultKey, context, env);
  }

  private async executeChatGptResearch(
    prompt: string,
    resultKey: string,
    context: WorkflowTriggerContext,
    env: AppEnv,
  ): Promise<WorkflowResearchRecord> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("ai_research: OPENAI_API_KEY is not configured");
    }

    const openai = createOpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    const result = await generateText({
      model: openai(CHATGPT_MODEL),
      prompt: buildResearchPrompt(prompt, context),
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

  private async executeGeminiResearch(
    prompt: string,
    resultKey: string,
    context: WorkflowTriggerContext,
    env: AppEnv,
  ): Promise<WorkflowResearchRecord> {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("ai_research: GOOGLE_GENERATIVE_AI_API_KEY is not configured");
    }

    const google = createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    const result = await generateText({
      model: google(GEMINI_MODEL),
      prompt: buildResearchPrompt(prompt, context),
      output: Output.object({
        schema: workflowResearchResultSchema,
      }),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      toolChoice: { type: "tool", toolName: "google_search" },
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

    return buildResearchRecord({
      provider: "gemini",
      model: GEMINI_MODEL,
      resultKey,
      prompt,
      output: withFallbackSources(result.output, result.sources),
    });
  }
}

function buildResearchPrompt(
  userPrompt: string,
  context: WorkflowTriggerContext,
): string {
  return [
    "You are researching a contact for an automation workflow.",
    "Always use the available search tools before answering.",
    "Return factual, concise, structured research.",
    "If a field is unknown, return null.",
    "Do not invent companies, roles, or URLs.",
    "",
    "Contact context:",
    `- Name: ${context.contactName ?? "Unknown"}`,
    `- Email: ${context.contactEmail ?? "Unknown"}`,
    `- Contact ID: ${context.contactId ?? "Unknown"}`,
    `- Booking ID: ${context.bookingId ?? "Unknown"}`,
    `- Form response ID: ${context.formResponseId ?? "Unknown"}`,
    "",
    "User research prompt:",
    userPrompt,
    "",
    "Focus on information that would help a sales or operations workflow decide what to do next.",
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
