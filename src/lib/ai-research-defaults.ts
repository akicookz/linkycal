import type { WorkflowStepInput } from "@/components/WorkflowInputsEditor";

export const DEFAULT_AI_RESEARCH_PROMPT = `Research this contact using the supplied contact information, the research
brief, and reliable public web sources.

Contact information:
- Name: {{input.name}}
- Email: {{input.email}}
- Phone: {{input.phone}}
- Existing notes: {{input.notes}}
- Company: {{input.company}}
- Role: {{input.position}}
- Website: {{input.website}}
- Company size: {{input.companySize}}
- Estimated revenue: {{input.estimatedRevenue}}
- LinkedIn URL: {{input.linkedinUrl}}

Identify and verify, where available:
- Full name and current role
- Company name, website, industry, and description
- Company size and estimated revenue range
- Professional profile or LinkedIn URL
- Location
- Recent activity
- Expansion
- Recent posts from the company or leadership
- Team members
- Evidence of fit, buying intent, risks, or missing information

Recommended tags must come from the available tags list in the research brief.
If none fit, return an empty list. Do not invent tag names.

Use product activity or other supplied context when present, but distinguish it
from public-web findings. Do not infer unsupported facts. Return null or [] for
unknown structured fields. Produce a concise summary, actionable insights,
recommended tags, and supporting source URLs.`;

export function seedAiResearchInputs(): WorkflowStepInput[] {
  return [
    { key: "name", source: { kind: "path", path: "contact.name" } },
    { key: "email", source: { kind: "path", path: "contact.email" } },
    { key: "phone", source: { kind: "path", path: "contact.phone" } },
    { key: "notes", source: { kind: "path", path: "contact.notes" } },
    { key: "company", source: { kind: "path", path: "contact.company" } },
    { key: "position", source: { kind: "path", path: "contact.position" } },
    { key: "website", source: { kind: "path", path: "contact.website" } },
    { key: "companySize", source: { kind: "path", path: "contact.companySize" } },
    {
      key: "estimatedRevenue",
      source: { kind: "path", path: "contact.estimatedRevenue" },
    },
    { key: "linkedinUrl", source: { kind: "path", path: "contact.linkedinUrl" } },
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
