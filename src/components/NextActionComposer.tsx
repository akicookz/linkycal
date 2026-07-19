import {
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  AlertCircle,
  CalendarClock,
  Loader,
  Pencil,
  Save,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  datetimeLocalToIso,
  formatDeadlineAtOffset,
  formatDeadlineInTimeZone,
  toDatetimeLocalValue,
} from "@/lib/contact-time";
import {
  parseNextActionSentence,
  type NextActionParseResult,
} from "@/lib/next-action-parser";
import { offsetMinutesForTimeZone } from "@/lib/timezone";

export interface NextActionValue {
  text: string;
  deadline: string;
}

interface NextActionComposerProps {
  initialAction: NextActionValue | null;
  pending: boolean;
  error: string | null;
  browserTimeZone?: string;
  referenceNow?: () => Date;
  parseDelayMs?: number;
  parseSentence?: typeof parseNextActionSentence;
  onSave: (value: NextActionValue) => void;
  onCancel: () => void;
}

const DEFAULT_PARSE_DELAY_MS = 150;

function currentDate() {
  return new Date();
}

function browserTimeZoneOrUtc(browserTimeZone: string | undefined): string {
  const candidate =
    browserTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(
      new Date(),
    );
    return candidate;
  } catch {
    return "UTC";
  }
}

function parseStatusMessage(result: NextActionParseResult): string | null {
  switch (result.status) {
    case "missing_deadline":
      return "Add a deadline or choose it manually.";
    case "missing_action":
      return "Add what needs to be done.";
    case "ambiguous":
      return "Choose one deadline.";
    case "past_deadline":
      return "Choose a future deadline.";
    default:
      return null;
  }
}

export function NextActionComposer({
  initialAction,
  pending,
  error,
  browserTimeZone,
  referenceNow = currentDate,
  parseDelayMs = DEFAULT_PARSE_DELAY_MS,
  parseSentence = parseNextActionSentence,
  onSave,
  onCancel,
}: NextActionComposerProps) {
  const [sentence, setSentence] = useState("");
  const [parseResult, setParseResult] = useState<NextActionParseResult>({
    status: "empty",
  });
  const [draftAction, setDraftAction] = useState(initialAction?.text ?? "");
  const [draftDeadline, setDraftDeadline] = useState(
    initialAction ? toDatetimeLocalValue(initialAction.deadline) : "",
  );
  const [editingAction, setEditingAction] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [parserUnavailable, setParserUnavailable] = useState(false);
  const [parsing, setParsing] = useState(false);
  const resolvedBrowserTimeZone = browserTimeZoneOrUtc(browserTimeZone);

  useEffect(() => {
    if (initialAction || parserUnavailable) return;
    if (!sentence.trim()) {
      setParseResult({ status: "empty" });
      setDraftAction("");
      setDraftDeadline("");
      setParsing(false);
      return;
    }

    let cancelled = false;
    setParsing(true);
    const timeout = setTimeout(() => {
      parseSentence(sentence, {
        now: referenceNow(),
        timeZone: resolvedBrowserTimeZone,
      })
        .then((result) => {
          if (cancelled) return;
          setParseResult(result);
          if (result.status === "valid") {
            setDraftAction(result.value.actionText);
            setDraftDeadline(toDatetimeLocalValue(result.value.deadlineIso));
          } else if (result.status === "ambiguous") {
            setParserUnavailable(true);
            setDraftAction(sentence);
            setDraftDeadline("");
          } else {
            setDraftAction("");
            setDraftDeadline("");
          }
        })
        .catch(() => {
          if (cancelled) return;
          setParserUnavailable(true);
          setDraftAction(sentence);
          setDraftDeadline("");
        })
        .finally(() => {
          if (!cancelled) setParsing(false);
        });
    }, parseDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    initialAction,
    parseDelayMs,
    parseSentence,
    parserUnavailable,
    referenceNow,
    resolvedBrowserTimeZone,
    sentence,
  ]);

  const draftDeadlineIso = datetimeLocalToIso(draftDeadline);
  const draftIsValid = Boolean(
    draftAction.trim() &&
      draftAction.trim().length <= 500 &&
      draftDeadlineIso,
  );
  const canSave = draftIsValid && !parsing && !pending;
  const parsed = parseResult.status === "valid" ? parseResult.value : null;
  const deadlinePreview = parsed
    ? formatDeadlineAtOffset(
        parsed.deadlineIso,
        parsed.timezoneOffsetMinutes,
        parsed.timezoneLabel,
      )
    : null;
  const viewerOffset = parsed
    ? offsetMinutesForTimeZone(parsed.deadlineIso, resolvedBrowserTimeZone)
    : null;
  const viewerPreview =
    parsed && viewerOffset !== parsed.timezoneOffsetMinutes
      ? formatDeadlineInTimeZone(parsed.deadlineIso, resolvedBrowserTimeZone)
      : null;
  const showManualDeadlineChoice =
    parseResult.status === "missing_deadline" ||
    parseResult.status === "past_deadline";
  const statusMessage =
    parserUnavailable && draftIsValid ? null : parseStatusMessage(parseResult);

  function save() {
    if (!canSave || !draftDeadlineIso) return;
    onSave({ text: draftAction.trim(), deadline: draftDeadlineIso });
  }

  function handleSentenceChange(event: ChangeEvent<HTMLInputElement>) {
    const nextSentence = event.target.value;
    setSentence(nextSentence);
    setParseResult({ status: "empty" });
    setDraftAction("");
    setDraftDeadline("");
    setEditingAction(false);
    setEditingDeadline(false);
    setParsing(Boolean(nextSentence.trim()));
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && canSave) {
      event.preventDefault();
      save();
    }
  }

  return (
    <div className="space-y-4" onKeyDown={handleComposerKeyDown}>
      {!initialAction && !parserUnavailable && (
        <div className="space-y-2">
          <Label htmlFor="next-action-sentence">
            What should happen, and when?
          </Label>
          <Input
            id="next-action-sentence"
            value={sentence}
            maxLength={600}
            placeholder="Call Atul by next Friday at 5pm ET"
            onChange={handleSentenceChange}
          />
        </div>
      )}

      {parsed && !parserUnavailable && (
        <div className="space-y-2">
          {editingAction ? (
            <div className="space-y-2">
              <Label htmlFor="next-action-draft-action">Action</Label>
              <Input
                id="next-action-draft-action"
                value={draftAction}
                maxLength={500}
                onChange={(event) => setDraftAction(event.target.value)}
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-10 w-full justify-start whitespace-normal bg-muted/50 px-3 py-2 text-left"
              aria-label={`Edit action: ${draftAction}`}
              onClick={() => setEditingAction(true)}
            >
              <Pencil className="h-4 w-4" />
              <span className="break-words text-pretty">{draftAction}</span>
            </Button>
          )}

          {editingDeadline ? (
            <div className="space-y-2">
              <Label htmlFor="next-action-draft-deadline">
                Deadline (your time)
              </Label>
              <Input
                id="next-action-draft-deadline"
                type="datetime-local"
                value={draftDeadline}
                onChange={(event) => setDraftDeadline(event.target.value)}
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-10 w-full justify-start whitespace-normal bg-muted/50 px-3 py-2 text-left tabular-nums"
              aria-label={`Edit deadline: ${deadlinePreview ?? "unknown"}`}
              onClick={() => setEditingDeadline(true)}
            >
              <CalendarClock className="h-4 w-4" />
              <span>{deadlinePreview}</span>
            </Button>
          )}

          {parsed.assumedTime && (
            <p className="text-xs font-medium text-muted-foreground">
              time assumed
            </p>
          )}
          {viewerPreview && (
            <p className="text-pretty text-xs tabular-nums text-muted-foreground">
              Your time: {viewerPreview}
            </p>
          )}
        </div>
      )}

      {(initialAction || parserUnavailable) && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="next-action-manual-action">Action</Label>
            <Input
              id="next-action-manual-action"
              value={draftAction}
              maxLength={500}
              onChange={(event) => setDraftAction(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next-action-manual-deadline">
              Deadline (your time)
            </Label>
            <Input
              id="next-action-manual-deadline"
              type="datetime-local"
              value={draftDeadline}
              onChange={(event) => setDraftDeadline(event.target.value)}
            />
          </div>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        className="min-w-0 space-y-1"
      >
        {parsing && (
          <p className="break-words text-pretty text-xs text-muted-foreground">
            Understanding deadline…
          </p>
        )}
        {statusMessage && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="min-w-0 break-words text-pretty">
              {statusMessage}
            </span>
          </p>
        )}
        {draftAction.trim().length > 500 && (
          <p className="break-words text-pretty text-xs text-destructive">
            Keep the action under 500 characters.
          </p>
        )}
        {error && (
          <p className="break-words text-pretty text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {showManualDeadlineChoice && !parserUnavailable && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setParserUnavailable(true);
            setDraftAction(sentence);
          }}
        >
          <CalendarClock className="h-4 w-4" />
          Choose date manually
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!canSave} onClick={save}>
          {pending ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
