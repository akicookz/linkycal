import { CheckCircle2, ExternalLink } from "lucide-react";

import {
  WORKFLOW_RESEARCH_FIELD_DEFINITIONS,
} from "../../shared/workflow-research-fields";

interface WorkflowResearchResultProps {
  value: unknown;
  fallbackSummary?: string;
  sourceCount?: number;
}

interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

const FACT_FIELDS = WORKFLOW_RESEARCH_FIELD_DEFINITIONS.filter(
  (field) => field.section === "facts",
);

export function WorkflowResearchResult({
  value,
  fallbackSummary = "",
  sourceCount: sourceCountProp,
}: WorkflowResearchResultProps) {
  const record = asRecord(value);
  const nestedResult = asRecord(record.result);
  const result = Object.keys(nestedResult).length > 0 ? nestedResult : record;
  const summary =
    asString(result.summary) ||
    asString(record.summary) ||
    fallbackSummary;
  const facts = FACT_FIELDS.flatMap((field) => {
    const fieldValue = asString(result[field.key]);
    return fieldValue ? [{ ...field, value: fieldValue }] : [];
  });
  const recommendedTags = asStringList(result.recommendedTags);
  const insights = asStringList(result.insights);
  const sources = asSources(result.sources);
  const storedSourceCount =
    typeof record.sourceCount === "number" ? record.sourceCount : undefined;
  const sourceCount = sourceCountProp ?? storedSourceCount ?? sources.length;

  return (
    <div className="space-y-3">
      {summary && (
        <ResearchSection title="Summary">
          <p className="text-sm text-muted-foreground text-pretty">{summary}</p>
        </ResearchSection>
      )}

      {facts.length > 0 && (
        <ResearchSection title="Findings">
          <dl className="space-y-2 text-sm">
            {facts.map((fact) => (
              <ResearchFact
                key={fact.key}
                label={fact.label}
                value={fact.value}
                isUrl={fact.kind === "url"}
              />
            ))}
          </dl>
        </ResearchSection>
      )}

      {recommendedTags.length > 0 && (
        <ResearchSection title="Recommended tags">
          <div className="flex flex-wrap gap-1.5">
            {recommendedTags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        </ResearchSection>
      )}

      {insights.length > 0 && (
        <ResearchSection title="Insights">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {insights.map((insight, index) => (
              <li key={`${insight}-${index}`} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-pretty">{insight}</span>
              </li>
            ))}
          </ul>
        </ResearchSection>
      )}

      {(sources.length > 0 || sourceCount > 0) && (
        <ResearchSection title="Public sources">
          {sources.length > 0 ? (
            <div className="space-y-2">
              {sources.map((source, index) => (
                <ResearchSourceCard
                  key={`${source.url}-${index}`}
                  source={source}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {sourceCount} source{sourceCount === 1 ? "" : "s"} were used, but
              links were not stored for this historical result.
            </p>
          )}
        </ResearchSection>
      )}
    </div>
  );
}

function ResearchSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-[16px] bg-muted/50 px-4 py-3">
      <h3 className="text-balance text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function ResearchFact({
  label,
  value,
  isUrl,
}: {
  label: string;
  value: string;
  isUrl: boolean;
}) {
  const safeUrl = isUrl ? getSafeHttpUrl(value) : null;

  return (
    <div className="grid grid-cols-1 items-start gap-1 sm:grid-cols-[110px_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap text-pretty font-medium">
        {safeUrl ? (
          <a
            href={safeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full min-w-0 items-center gap-1 text-primary hover:underline"
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function ResearchSourceCard({ source }: { source: ResearchSource }) {
  const safeUrl = getSafeHttpUrl(source.url);
  const title = source.title || source.url;

  return (
    <article className="rounded-[12px] bg-background px-3 py-2">
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full min-w-0 items-start gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <span className="min-w-0 break-words text-pretty">{title}</span>
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        </a>
      ) : (
        <p className="break-words text-pretty text-sm font-medium">{title}</p>
      )}
      {source.snippet && (
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          {source.snippet}
        </p>
      )}
    </article>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function asSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const source = asRecord(entry);
    const url = asString(source.url);
    const title = asString(source.title);
    const snippet = asString(source.snippet);
    if (!url && !title && !snippet) return [];
    return [{ title, url, snippet }];
  });
}

function getSafeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
