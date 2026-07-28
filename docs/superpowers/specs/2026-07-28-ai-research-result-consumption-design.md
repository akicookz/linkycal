# AI Research Result Visibility and Workflow Consumption

Date: 2026-07-28  
Status: Approved

## Goal

Make every value returned by AI Research visible in LinkyCal and available to
later workflow steps, including email, without redesigning workflow variable
binding.

Users keep the existing exposed `{{...}}` syntax, autocomplete, and step-input
source selector. The change is limited to completing the research data
contract, making its presentation reusable, and adding safe text and HTML
formatters for structured findings.

## Current behavior and root cause

AI Research validates a twelve-field result:

- `summary`
- `company`
- `role`
- `website`
- `linkedinUrl`
- `location`
- `description`
- `companySize`
- `estimatedRevenue`
- `recommendedTags`
- `insights`
- `sources`

The complete record is persisted in contact metadata, activity metadata, and
the workflow-run context. Contact enrichment also copies supported values into
dedicated contact columns.

The loss happens after persistence:

- the workflow step output manually copies fields and omits `description`;
- the workflow-run result view omits description, company size, estimated
  revenue, recommended tags, and source snippets;
- the contact-activity research view repeats the same incomplete presentation;
- the workflow variable catalog exposes only seven research fields;
- named research-result variables expose only summary, company, and role;
- arrays and source objects use the generic workflow stringifier, producing
  comma-separated values or JSON-like text rather than useful email content;
- the builder uses the configured result key while the runtime uses a
  normalized key, so a displayed named-result path can differ from the stored
  path.

These consumers were added at different times as independent field lists. The
provider schema later expanded without a contract forcing those consumers to
expand with it.

## Product decisions

### Keep the existing variable-binding UX

This work does not introduce tokens, a new variable picker, a rich email
composer, or a shared binding-control rewrite.

Users continue to:

- type `{{` to open autocomplete in variable-aware text fields;
- select a source from the existing Inputs editor;
- see the inserted technical key in the saved value;
- use the existing condition field selector.

The variable catalog gains the missing research values and presentation-ready
aliases. Raw keys remain visible by design.

### Support individual values and complete reports

Later steps can select individual research values. Email and other text
consumers also receive text and HTML representations of lists, sources, and the
complete research report.

### Preserve the existing storage envelope

The stored contract remains:

```text
metadata.workflow.research.latest
metadata.workflow.research.byKey.<normalizedResultKey>
```

Existing latest-result aliases remain:

```text
{{research.summary}}
{{research.company}}
```

No database migration or historical-data rewrite is required.

## Research field registry

Add a framework-free shared research-field registry. Each entry defines:

```ts
interface WorkflowResearchFieldDefinition {
  key: WorkflowResearchFieldKey;
  label: string;
  kind: "text" | "url" | "string_list" | "sources";
  section: "summary" | "facts" | "signals" | "evidence";
}
```

The registry contains exactly the twelve provider-result keys. It has no React,
Lucide, or provider dependencies and can be imported by the client and Worker.

The backend Zod object shape must satisfy
`Record<WorkflowResearchFieldKey, z.ZodTypeAny>` at compile time. This prevents
adding or removing a provider field without updating the registry. Client
variable definitions and scalar result rows derive from the registry rather
than maintaining another manual list.

Special rendering remains explicit for string lists and sources, but their
presence and labels still come from the registry.

## Runtime data flow

The provider returns a validated `WorkflowResearchResult`. The executor:

1. persists the complete record in contact metadata;
2. persists the complete record in research activity metadata;
3. copies supported facts into contact columns and appends the summary to
   contact notes through the existing enrichment path;
4. copies the complete result into the step output using the result object,
   instead of enumerating fields manually;
5. exposes the complete latest result and normalized named results to later
   workflow steps;
6. derives presentation-ready text and HTML aliases at context-view time.

Derived aliases are not persisted. They are deterministic views of the stored
result, so formatting improvements do not require rewriting contact or run
data.

## Workflow variables

### Individual latest-result fields

The existing Research group exposes all scalar and list values:

```text
{{research.summary}}
{{research.company}}
{{research.role}}
{{research.website}}
{{research.linkedinUrl}}
{{research.location}}
{{research.description}}
{{research.companySize}}
{{research.estimatedRevenue}}
{{research.recommendedTags}}
{{research.insights}}
```

The raw `sources` object array remains resolvable for compatibility but is not
the recommended email representation.

### Presentation-ready latest-result fields

Add:

```text
{{research.recommendedTagsText}}
{{research.insightsText}}
{{research.sourcesText}}
{{research.sourcesHtml}}
{{research.reportText}}
{{research.reportHtml}}
```

Autocomplete labels make the intended output clear, including that HTML
variants belong in an email or webhook body rather than a subject.

### Named research results

When multiple earlier AI Research steps exist, every result exposes the same
complete raw and formatted set:

```text
{{research.byKey.lead_research.result.companySize}}
{{research.byKey.lead_research.result.insights}}
{{research.byKey.lead_research.sourcesText}}
{{research.byKey.lead_research.reportHtml}}
```

The builder and runtime use the same normalization function for result keys.
Autocomplete labels use the workflow step label, while inserted values retain
the exposed normalized key.

The `research.*` aliases continue to mean the most recent research result.

## Formatting contract

### Lists

- `recommendedTagsText`: trimmed, non-empty tags joined with `, `.
- `insightsText`: trimmed, non-empty insights rendered as one `- ` bullet per
  line.

The existing raw array interpolation remains unchanged for backward
compatibility.

### Sources

`sourcesText` renders each valid source in order:

```text
1. Source title — https://example.com
   Supporting snippet
```

Empty titles fall back to the URL. Empty snippets are omitted.

`sourcesHtml` renders a semantic list. Every title, URL label, and snippet is
HTML-escaped. Only `http:` and `https:` URLs become links. Unsupported or
malformed URLs render as escaped text.

### Complete reports

`reportText` contains only non-empty sections:

```text
AI research

Summary
...

Company
Company: ...
Role: ...
Website: ...
Location: ...
Company size: ...
Estimated revenue: ...
Description: ...

Recommended tags
...

Insights
- ...

Sources
1. ...
```

`reportHtml` carries the same information in semantic HTML. All model-returned
content is escaped before insertion, and only safe source and profile URLs
become links.

Unknown scalar values and empty collections are omitted. A completely empty
optional section produces no heading or placeholder text.

## Result presentation

Create one reusable research-result presentation component used by:

- AI Research workflow step logs;
- contact-activity research details.

It accepts either a full research record or a normalized result and renders:

1. summary;
2. company and person facts;
3. company description;
4. company size and estimated revenue;
5. recommended tags;
6. insights;
7. public sources with title, link, and snippet.

Only non-empty returned values render. Historical activity rows that contain
only summary and source count keep their existing reduced-detail fallback.

The presentation remains display-only. Recommended tags are not automatically
created or applied to the contact.

## Email behavior

The Send Email step continues to interpolate subject and body through the
existing runtime.

Users may insert individual values or:

- `reportText` into a plain-text body;
- `reportHtml` into an HTML body;
- `sourcesText` or `sourcesHtml` when only evidence is needed.

The current HTML-body detection remains compatible with `reportHtml`. Existing
saved templates and manually typed variables continue working.

No field-specific variable filtering is added in this scope. Autocomplete labels
identify HTML values as body-oriented, but the user can still type any exposed
key manually.

## Error and compatibility behavior

- Missing or null values continue to interpolate as an empty string.
- Empty arrays produce an empty formatted alias.
- Report formatters omit empty sections.
- Malformed source entries are skipped rather than failing the workflow.
- Unsafe source URLs render as text in HTML output.
- Historical partial research records render available data without errors.
- Existing `research.*` paths are unchanged.
- Existing `research.byKey.*.result.*` paths are unchanged.
- Existing raw array and object stringification is unchanged.
- No database migration is required.

## Testing

### Critical workflow journey

Strengthen the existing AI Research workflow journey by adding a following Send
Email step. Use a deterministic research record containing literal values for
all twelve fields.

The test must demonstrate red before production changes and assert:

- the complete result is present in contact metadata and activity metadata;
- the complete result is present in the workflow step output;
- dedicated contact columns still receive their mapped values;
- the actual captured Resend payload contains selected individual fields;
- the text report contains summary, facts, tags, insights, source title, URL,
  and snippet;
- the HTML report contains escaped content and links only safe URLs;
- the expanded provider prompt and provider secrets remain absent from
  persistence and delivery.

### Observable UI coverage

Extend the strongest existing workflow-run or contact-activity rendering
journey to supply a complete research record and assert that description,
company size, estimated revenue, recommended tags, insights, source title, and
source snippet are visible.

Do not assert styling classes, DOM ancestry, or component internals.

### Variable selection behavior

Exercise the production variable-group builder with one and multiple prior AI
Research steps. Assert literal autocomplete paths for every missing raw and
formatted value, including the canonical normalized result key.

Compile-time exhaustiveness owns schema-to-registry coverage; no source-text or
type-shape test is added.

## Out of scope

- Reworking variable inputs into token controls.
- Adding a new Insert Variable button or rich email composer.
- Hiding technical `{{...}}` keys.
- Changing AI providers, models, prompts, or search behavior.
- Changing research persistence or adding database columns.
- Automatically creating or applying recommended tags.
- Making source objects addressable by array index.
- Retrofitting historical records with fields they never stored.
