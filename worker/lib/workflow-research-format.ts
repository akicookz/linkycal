import {
  WORKFLOW_RESEARCH_FIELD_DEFINITIONS,
  type WorkflowResearchFieldDefinition,
} from "../../shared/workflow-research-fields";

export interface WorkflowResearchFormattedValues {
  recommendedTagsText: string;
  insightsText: string;
  sourcesText: string;
  sourcesHtml: string;
  reportText: string;
  reportHtml: string;
}

interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export function buildWorkflowResearchFormattedValues(
  result: unknown,
): WorkflowResearchFormattedValues {
  const record = asRecord(result);
  const recommendedTags = asStringList(record.recommendedTags);
  const insights = asStringList(record.insights);
  const sources = asSources(record.sources);
  const recommendedTagsText = recommendedTags.join(", ");
  const insightsText = insights.map((insight) => `- ${insight}`).join("\n");
  const sourcesText = formatSourcesText(sources);
  const sourcesHtml = formatSourcesHtml(sources);

  return {
    recommendedTagsText,
    insightsText,
    sourcesText,
    sourcesHtml,
    reportText: formatReportText(record, sourcesText),
    reportHtml: formatReportHtml(record, sourcesHtml),
  };
}

function formatSourcesText(sources: ResearchSource[]): string {
  return sources
    .map((source, index) => {
      const title = source.title || source.url;
      const heading = `${index + 1}. ${title} — ${source.url}`;
      return source.snippet
        ? `${heading}\n   ${source.snippet}`
        : heading;
    })
    .join("\n");
}

function formatSourcesHtml(sources: ResearchSource[]): string {
  if (sources.length === 0) return "";

  const items = sources.map((source) => {
    const title = source.title || source.url;
    const safeUrl = safeHttpUrl(source.url);
    const heading = safeUrl
      ? `<a href="${escapeHtml(safeUrl)}">${escapeHtml(title)}</a>`
      : `<span>${escapeHtml(title || source.url)}</span>`;
    const snippet = source.snippet
      ? `<p>${escapeHtml(source.snippet)}</p>`
      : "";
    return `<li>${heading}${snippet}</li>`;
  });

  return `<ul>${items.join("")}</ul>`;
}

function formatReportText(
  record: Record<string, unknown>,
  sourcesText: string,
): string {
  const sections: string[] = [];

  for (const field of WORKFLOW_RESEARCH_FIELD_DEFINITIONS) {
    if (field.kind === "sources") continue;
    const value = formatFieldPlainValue(field, record);
    if (!value) continue;
    sections.push(`${reportLabel(field)}: ${value}`);
  }

  if (sourcesText) {
    sections.push(`Sources:\n${sourcesText}`);
  }

  return sections.join("\n\n");
}

function formatReportHtml(
  record: Record<string, unknown>,
  sourcesHtml: string,
): string {
  const sections: string[] = [];

  for (const field of WORKFLOW_RESEARCH_FIELD_DEFINITIONS) {
    if (field.kind === "sources") continue;
    const value = formatFieldPlainValue(field, record);
    if (!value) continue;
    const label = escapeHtml(`${reportLabel(field)}:`);
    const content = field.kind === "url"
      ? formatUrlHtml(value)
      : escapeHtml(value);
    sections.push(`<p><strong>${label}</strong> ${content}</p>`);
  }

  if (sourcesHtml) {
    sections.push(`<p><strong>Sources:</strong></p>${sourcesHtml}`);
  }

  return sections.join("");
}

function formatFieldPlainValue(
  field: WorkflowResearchFieldDefinition,
  record: Record<string, unknown>,
): string | null {
  if (field.kind === "text" || field.kind === "url") {
    const value = asString(record[field.key]);
    return value || null;
  }
  if (field.kind === "string_list") {
    const items = asStringList(record[field.key]);
    return items.length > 0 ? items.join(", ") : null;
  }
  return null;
}

function formatUrlHtml(value: string): string {
  const safeUrl = safeHttpUrl(value);
  const escaped = escapeHtml(value);
  return safeUrl
    ? `<a href="${escapeHtml(safeUrl)}">${escaped}</a>`
    : escaped;
}

function reportLabel(field: WorkflowResearchFieldDefinition): string {
  if (field.key === "summary") return "Summary";
  if (field.key === "company") return "Company";
  if (field.key === "role") return "Role";
  if (field.key === "website") return "Website";
  if (field.key === "linkedinUrl") return "LinkedIn";
  return field.label;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry) => entry.length > 0);
}

function asSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const source = asRecord(entry);
    const url = asString(source.url);
    if (!url) return [];
    return [{
      title: asString(source.title),
      url,
      snippet: asString(source.snippet),
    }];
  });
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
