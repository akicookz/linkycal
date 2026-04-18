import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { RichTextContent } from "@/components/RichTextContent";

type Input = Record<string, unknown> | null;
type Output = Record<string, unknown> | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter((s) => s.length > 0);
  if (typeof value === "string") return value.split(/[\n,;]+/g).map((s) => s.trim()).filter(Boolean);
  return [];
}

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3 items-start">
      <div className="text-[11px] font-medium text-muted-foreground pt-0.5">{label}</div>
      <div className={`text-[13px] text-foreground ${mono ? "font-mono" : ""}`}>{children}</div>
    </div>
  );
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "success" | "destructive" | "info" }) {
  const cls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : tone === "destructive"
        ? "bg-red-50 text-red-700 border border-red-200"
        : tone === "info"
          ? "bg-blue-50 text-blue-700 border border-blue-200"
          : "bg-muted text-muted-foreground border border-border";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function KeyValueChips({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) {
    return <span className="text-[11px] text-muted-foreground italic">No inputs wired</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-[8px] bg-background border border-border px-2 py-0.5 text-[11px]"
        >
          <span className="font-mono text-muted-foreground">{key}</span>
          <span className="text-muted-foreground">:</span>
          <span className="text-foreground max-w-[200px] truncate">{asString(value)}</span>
        </span>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-muted/40 p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function ResolvedInputs({ input }: { input: Input }) {
  const resolved = isRecord(input?.resolvedInputs) ? input.resolvedInputs : null;
  if (!resolved || Object.keys(resolved).length === 0) return null;
  return (
    <Section title="Inputs">
      <KeyValueChips values={resolved} />
    </Section>
  );
}

// ─── Step-type renderers ────────────────────────────────────────────────────

function SendEmailLog({ input, output }: { input: Input; output: Output }) {
  const recipientSource =
    input?.recipients ??
    (isRecord(input?.config) ? (input!.config as Record<string, unknown>).toList : []);
  const recipients = asStringArray(recipientSource);
  const from = asString(input?.from);
  const subject = asString(input?.subject);
  const body = asString(input?.body);
  const sent = output?.sent === true;

  return (
    <div className="space-y-2">
      <ResolvedInputs input={input} />
      <Section title="Email">
        <div className="space-y-2">
          {from && <Field label="From">{from}</Field>}
          <Field label="To">
            <div className="flex flex-wrap gap-1">
              {recipients.length === 0 ? (
                <span className="text-muted-foreground italic">No recipients</span>
              ) : (
                recipients.map((r, i) => (
                  <Pill key={i} tone="info">{r}</Pill>
                ))
              )}
            </div>
          </Field>
          <Field label="Subject">{subject || <span className="text-muted-foreground italic">(no subject)</span>}</Field>
          <Field label="Body">
            {body ? (
              <div className="rounded-[8px] border border-border bg-background p-2.5 max-h-[320px] overflow-auto">
                <RichTextContent value={body} className="text-[13px] text-foreground" />
              </div>
            ) : (
              <span className="text-muted-foreground italic">(empty)</span>
            )}
          </Field>
        </div>
      </Section>
      <Section title="Result">
        <Pill tone={sent ? "success" : "muted"}>{sent ? "Sent" : "Not sent"}</Pill>
      </Section>
    </div>
  );
}

function AiResearchLog({ input, output }: { input: Input; output: Output }) {
  const provider = asString(input?.provider);
  const resultKey = asString(input?.resultKey);
  const finalPrompt = asString(input?.finalPrompt);
  const summary = asString(output?.summary);
  const company = asString(output?.company);
  const role = asString(output?.role);
  const website = asString(output?.website);
  const location = asString(output?.location);
  const linkedinUrl = asString(output?.linkedinUrl);
  const sources = Array.isArray(output?.sources) ? (output!.sources as Array<Record<string, unknown>>) : [];
  const model = asString(output?.model);

  return (
    <div className="space-y-2">
      <ResolvedInputs input={input} />
      <Section title="Request">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {provider && <Pill tone="info">{provider === "gemini" ? "Gemini" : "ChatGPT"}</Pill>}
            {model && <Pill>{model}</Pill>}
            {resultKey && <Pill>stored as {`{{${resultKey}.*}}`}</Pill>}
          </div>
          {finalPrompt && (
            <div className="rounded-[8px] border border-border bg-background p-2.5 max-h-[240px] overflow-auto whitespace-pre-wrap text-[12px] font-mono text-foreground">
              {finalPrompt}
            </div>
          )}
        </div>
      </Section>
      {(summary || company || role) && (
        <Section title="Findings">
          <div className="space-y-2">
            {summary && <Field label="Summary">{summary}</Field>}
            {company && <Field label="Company">{company}</Field>}
            {role && <Field label="Role">{role}</Field>}
            {website && (
              <Field label="Website">
                <a href={website} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                  {website} <ExternalLink className="h-3 w-3" />
                </a>
              </Field>
            )}
            {linkedinUrl && (
              <Field label="LinkedIn">
                <a href={linkedinUrl} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                  {linkedinUrl} <ExternalLink className="h-3 w-3" />
                </a>
              </Field>
            )}
            {location && <Field label="Location">{location}</Field>}
          </div>
        </Section>
      )}
      {sources.length > 0 && (
        <Section title="Sources">
          <ul className="space-y-1">
            {sources.map((s, i) => {
              const url = asString(s.url);
              const title = asString(s.title) || url;
              return (
                <li key={i} className="text-[12px]">
                  <a href={url} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    {title} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}

function UpdateContactLog({ input, output }: { input: Input; output: Output }) {
  const field = asString(input?.field);
  const value = asString(input?.value);
  const updated = output?.updated === true;
  const reason = asString(output?.reason);
  return (
    <div className="space-y-2">
      <ResolvedInputs input={input} />
      <Section title="Update">
        <div className="space-y-2">
          <Field label="Field">
            <Pill>{field || "—"}</Pill>
          </Field>
          <Field label="New value">
            {value ? (
              <div className="rounded-[8px] border border-border bg-background p-2 whitespace-pre-wrap">
                {value}
              </div>
            ) : (
              <span className="text-muted-foreground italic">(empty)</span>
            )}
          </Field>
        </div>
      </Section>
      <Section title="Result">
        <Pill tone={updated ? "success" : "muted"}>
          {updated ? "Contact updated" : reason === "no_contact" ? "Skipped — no contact" : "Not updated"}
        </Pill>
      </Section>
    </div>
  );
}

function TagLog({ input, output, verb }: { input: Input; output: Output; verb: "add" | "remove" }) {
  const tagName = asString(input?.tagName);
  const tagId = asString(input?.tagId);
  const applied = verb === "add" ? output?.applied === true : output?.removed === true;
  const reason = asString(output?.reason);
  return (
    <div className="space-y-2">
      <ResolvedInputs input={input} />
      <Section title="Tag">
        <Field label="Tag">
          <Pill>{tagName || tagId || "—"}</Pill>
        </Field>
      </Section>
      <Section title="Result">
        <Pill tone={applied ? "success" : "muted"}>
          {applied
            ? verb === "add"
              ? "Tag added"
              : "Tag removed"
            : reason === "no_contact"
              ? "Skipped — no contact"
              : "Not applied"}
        </Pill>
      </Section>
    </div>
  );
}

function WaitLog({ input, output }: { input: Input; output: Output }) {
  const config = isRecord(input?.config) ? input!.config : {};
  const duration = asString(config.duration);
  const unit = asString(config.unit);
  const waitSeconds = output?.waitSeconds;
  return (
    <div className="space-y-2">
      <Section title="Wait">
        <Field label="Duration">
          {duration} {unit}
        </Field>
        {typeof waitSeconds === "number" && (
          <Field label="Scheduled">{waitSeconds}s queued</Field>
        )}
      </Section>
    </div>
  );
}

function ConditionLog({ input, output }: { input: Input; output: Output }) {
  const field = asString(input?.field);
  const operator = asString(input?.operator);
  const value = asString(input?.value);
  const actual = asString(input?.actual);
  const passed = output?.passed === true;
  return (
    <div className="space-y-2">
      <ResolvedInputs input={input} />
      <Section title="Condition">
        <div className="space-y-2">
          <Field label="Field" mono>{field || "—"}</Field>
          <Field label="Operator">
            <Pill>{operator || "—"}</Pill>
          </Field>
          <Field label="Expected">{value || <span className="text-muted-foreground italic">(empty)</span>}</Field>
          <Field label="Actual">{actual || <span className="text-muted-foreground italic">(empty)</span>}</Field>
        </div>
      </Section>
      <Section title="Result">
        <Pill tone={passed ? "success" : "destructive"}>{passed ? "Passed" : "Failed — workflow stopped"}</Pill>
      </Section>
    </div>
  );
}

function WebhookLog({ input, output }: { input: Input; output: Output }) {
  const url = asString(input?.url);
  const method = asString(input?.method);
  const body = asString(input?.body);
  const status = output?.status;
  const ok = output?.ok === true;
  return (
    <div className="space-y-2">
      <ResolvedInputs input={input} />
      <Section title="Request">
        <div className="space-y-2">
          <Field label="Method">
            <Pill>{method || "POST"}</Pill>
          </Field>
          <Field label="URL" mono>{url}</Field>
          {body && (
            <Field label="Body">
              <div className="rounded-[8px] border border-border bg-background p-2 whitespace-pre-wrap font-mono text-[12px] max-h-[200px] overflow-auto">
                {body}
              </div>
            </Field>
          )}
        </div>
      </Section>
      <Section title="Result">
        <div className="flex flex-wrap gap-1.5 items-center">
          <Pill tone={ok ? "success" : "destructive"}>
            {typeof status === "number" ? `${status}` : ok ? "OK" : "Failed"}
          </Pill>
        </div>
      </Section>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function WorkflowStepLog({
  stepType,
  input,
  output,
  error,
}: {
  stepType: string;
  input: Input;
  output: Output;
  error: string | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const body = (() => {
    switch (stepType) {
      case "send_email":
        return <SendEmailLog input={input} output={output} />;
      case "ai_research":
        return <AiResearchLog input={input} output={output} />;
      case "update_contact":
        return <UpdateContactLog input={input} output={output} />;
      case "add_tag":
        return <TagLog input={input} output={output} verb="add" />;
      case "remove_tag":
        return <TagLog input={input} output={output} verb="remove" />;
      case "wait":
        return <WaitLog input={input} output={output} />;
      case "condition":
        return <ConditionLog input={input} output={output} />;
      case "webhook":
        return <WebhookLog input={input} output={output} />;
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-2">
      {body ?? (
        <Section title="Details">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
            {JSON.stringify({ input, output }, null, 2)}
          </pre>
        </Section>
      )}
      {error && (
        <div className="rounded-[12px] bg-red-50 border border-red-200 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 mb-1">
            Error
          </p>
          <pre className="text-[12px] font-mono text-red-900 whitespace-pre-wrap break-all">
            {error}
          </pre>
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5"
      >
        {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {showRaw ? "Hide raw data" : "View raw data"}
      </button>
      {showRaw && (
        <div className="rounded-[12px] bg-muted/40 p-3 space-y-2">
          {input && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Input</p>
              <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Output</p>
              <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
