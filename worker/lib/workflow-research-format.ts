import {
  WORKFLOW_RESEARCH_FIELD_DEFINITIONS,
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
    reportText: formatReportText(
      record,
      recommendedTagsText,
      insightsText,
      sourcesText,
    ),
    reportHtml: formatReportHtml(
      record,
      recommendedTagsText,
      insights,
      sourcesHtml,
    ),
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
  recommendedTagsText: string,
  insightsText: string,
  sourcesText: string,
): string {
  const sections = ["AI research"];

  for (const field of WORKFLOW_RESEARCH_FIELD_DEFINITIONS) {
    if (
      field.kind === "string_list" ||
      field.kind === "sources"
    ) {
      continue;
    }
    const value = asString(record[field.key]);
    if (!value) continue;
    sections.push(`${reportLabel(field.key, field.label)}\n${value}`);
  }

  if (recommendedTagsText) {
    sections.push(`Recommended tags\n${recommendedTagsText}`);
  }
  if (insightsText) {
    sections.push(`Insights\n${insightsText}`);
  }
  if (sourcesText) {
    sections.push(`Sources\n${sourcesText}`);
  }

  return sections.join("\n\n");
}

function formatReportHtml(
  record: Record<string, unknown>,
  recommendedTagsText: string,
  insights: string[],
  sourcesHtml: string,
): string {
  const sections = ["<section><h2>AI research</h2>"];

  for (const field of WORKFLOW_RESEARCH_FIELD_DEFINITIONS) {
    if (
      field.kind === "string_list" ||
      field.kind === "sources"
    ) {
      continue;
    }
    const value = asString(record[field.key]);
    if (!value) continue;
    const safeUrl = field.kind === "url" ? safeHttpUrl(value) : null;
    const content = safeUrl
      ? `<a href="${escapeHtml(safeUrl)}">${escapeHtml(value)}</a>`
      : escapeHtml(value);
    sections.push(
      `<h3>${escapeHtml(reportLabel(field.key, field.label))}</h3>` +
      `<p>${content}</p>`,
    );
  }

  if (recommendedTagsText) {
    sections.push(
      `<h3>Recommended tags</h3><p>${escapeHtml(recommendedTagsText)}</p>`,
    );
  }
  if (insights.length > 0) {
    sections.push(
      "<h3>Insights</h3><ul>" +
      insights.map((insight) => `<li>${escapeHtml(insight)}</li>`).join("") +
      "</ul>",
    );
  }
  if (sourcesHtml) {
    sections.push(`<h3>Sources</h3>${sourcesHtml}`);
  }

  sections.push("</section>");
  return sections.join("");
}

function reportLabel(key: string, fallback: string): string {
  if (key === "summary") return "Summary";
  if (key === "company") return "Company";
  if (key === "role") return "Role";
  if (key === "website") return "Website";
  if (key === "linkedinUrl") return "LinkedIn";
  return fallback;
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
