import type { WorkflowResearchResult } from "./workflow-runtime";

export interface ContactEnrichFields {
  company?: string;
  companyWebsite?: string;
  position?: string;
  companySize?: string;
  estimatedRevenue?: string;
  linkedinUrl?: string;
}

function clean(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

// Maps an AI research result into contact column updates, omitting empty values
// so a re-run never blanks a field the AI couldn't find this time.
export function enrichContactFromResearch(
  result: WorkflowResearchResult,
): ContactEnrichFields {
  const out: ContactEnrichFields = {};
  const company = clean(result.company);
  const companyWebsite = clean(result.website);
  const position = clean(result.role);
  const companySize = clean(result.companySize);
  const estimatedRevenue = clean(result.estimatedRevenue);
  const linkedinUrl = clean(result.linkedinUrl);
  if (company) out.company = company;
  if (companyWebsite) out.companyWebsite = companyWebsite;
  if (position) out.position = position;
  if (companySize) out.companySize = companySize;
  if (estimatedRevenue) out.estimatedRevenue = estimatedRevenue;
  if (linkedinUrl) out.linkedinUrl = linkedinUrl;
  return out;
}

// Appends a dated executive-summary block, preserving any existing notes.
export function appendResearchSummaryToNotes(
  existingNotes: string | null | undefined,
  summary: string,
  date: string,
): string {
  const block = `— Research summary (${date}) —\n${summary.trim()}`;
  const base = (existingNotes ?? "").trimEnd();
  return base.length > 0 ? `${base}\n\n${block}` : block;
}
