export interface ResearchBriefContact {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  company?: string | null;
  website?: string | null;
  position?: string | null;
  companySize?: string | null;
  estimatedRevenue?: string | null;
  linkedinUrl?: string | null;
}

export interface ResearchBriefInput {
  contact: ResearchBriefContact;
  availableTags: readonly string[];
  formFields?: Record<string, unknown>;
}

const CONTACT_FACT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "notes", label: "Notes" },
  { key: "company", label: "Company" },
  { key: "website", label: "Website" },
  { key: "position", label: "Position" },
  { key: "companySize", label: "Company size" },
  { key: "estimatedRevenue", label: "Estimated revenue" },
  { key: "linkedinUrl", label: "LinkedIn URL" },
] as const satisfies readonly {
  key: keyof ResearchBriefContact;
  label: string;
}[];

export function constrainRecommendedTags(
  recommended: readonly string[],
  available: readonly string[],
): string[] {
  if (available.length === 0) return [];

  const wanted = new Set(
    recommended
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0),
  );
  const seen = new Set<string>();
  const matched: string[] = [];

  for (const tag of available) {
    const canonical = tag.trim();
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (!wanted.has(key) || seen.has(key)) continue;
    seen.add(key);
    matched.push(canonical);
  }

  return matched;
}

export function buildResearchBrief(input: ResearchBriefInput): string {
  const sections: string[] = [];

  const facts = CONTACT_FACT_FIELDS.flatMap((field) => {
    const value = asNonEmptyString(input.contact[field.key]);
    return value ? [`- ${field.label}: ${value}`] : [];
  });
  if (facts.length > 0) {
    sections.push(["On-file contact facts:", ...facts].join("\n"));
  }

  const formAnswers = Object.entries(input.formFields ?? {}).flatMap(
    ([key, value]) => {
      const rendered = renderFormFieldValue(value);
      return rendered ? [`- ${key}: ${rendered}`] : [];
    },
  );
  if (formAnswers.length > 0) {
    sections.push(["Form field answers:", ...formAnswers].join("\n"));
  }

  const tagLines = input.availableTags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => `- ${tag}`);
  sections.push(
    [
      "Available tags:",
      ...(tagLines.length > 0 ? tagLines : ["- (none)"]),
    ].join("\n"),
  );

  sections.push(
    [
      "Recommend tags only from the available tags list.",
      "If none fit, return an empty list.",
      "Do not invent tag names.",
    ].join(" "),
  );

  sections.push(
    [
      "Hunt for these public facts. Return null or [] when unknown.",
      "Do not invent companies, roles, URLs, or tags:",
      "- Company",
      "- Role",
      "- Website",
      "- LinkedIn",
      "- Location",
      "- Description",
      "- Company size",
      "- Estimated revenue",
      "- Recent activity",
      "- Expansion",
      "- Recent posts from the company or leadership",
      "- Team members",
    ].join("\n"),
  );

  return sections.join("\n\n");
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function renderFormFieldValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return asNonEmptyString(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}
