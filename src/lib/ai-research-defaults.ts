import type { WorkflowStepInput } from "@/components/WorkflowInputsEditor";

export const DEFAULT_AI_RESEARCH_PROMPT = `Research this contact using the supplied contact information and reliable
public web sources.

Contact information:
- Name: {{input.name}}
- Email: {{input.email}}
- Phone: {{input.phone}}
- Existing notes: {{input.notes}}

Identify and verify, where available:
- Full name and current role
- Company name, website, industry, and description
- Company size and estimated revenue range
- Professional profile or LinkedIn URL
- Location
- Recent company or professional signals relevant to follow-up
- Evidence of fit, buying intent, risks, or missing information

Use product activity or other supplied context when present, but distinguish it
from public-web findings. Do not infer unsupported facts. Return null for
unknown structured fields. Produce a concise summary, actionable insights,
recommended tags, and supporting source URLs.`;

export function seedAiResearchInputs(): WorkflowStepInput[] {
  return [
    { key: "name", source: { kind: "path", path: "contact.name" } },
    { key: "email", source: { kind: "path", path: "contact.email" } },
    { key: "phone", source: { kind: "path", path: "contact.phone" } },
    { key: "notes", source: { kind: "path", path: "contact.notes" } },
  ];
}

export function applyAiResearchDefaults(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const prompt = String(config.prompt ?? "");
  return {
    provider: "chatgpt",
    resultKey: "research",
    ...config,
    prompt: prompt.trim() ? prompt : DEFAULT_AI_RESEARCH_PROMPT,
  };
}
