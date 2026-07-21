import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { AlertCircle, CalendarClock, Loader, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  datetimeLocalToIso,
  formatDeadlineInTimeZone,
  toDatetimeLocalValue,
} from "@/lib/contact-time";
import {
  parseNextActionSentence,
  type NextActionParseResult,
} from "@/lib/next-action-parser";
import { offsetMinutesForTimeZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export interface NextActionValue {
  text: string;
  deadline: string | null;
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

type DeadlineSource = "initial" | "parsed" | "manual" | null;

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
    case "missing_action":
      return "Add what needs to be done.";
    case "ambiguous":
      return "Choose one deadline.";
    case "past_deadline":
      return "Choose a future deadline.";
    case "invalid_deadline":
      return "Choose a valid local time.";
    default:
      return null;
  }
}

function isPastStructuredDeadline(
  draftDeadlineIso: string | null,
  draftDeadline: string,
  initialAction: NextActionValue | null,
  now: Date,
): boolean {
  if (!draftDeadlineIso) return false;
  if (
    initialAction?.deadline &&
    draftDeadline === toDatetimeLocalValue(initialAction.deadline)
  ) {
    return false;
  }
  return new Date(draftDeadlineIso).getTime() <= now.getTime();
}

function blocksSave(
  result: NextActionParseResult,
  hasAuthoritativeDeadline: boolean,
): boolean {
  if (result.status === "missing_action") return true;
  if (hasAuthoritativeDeadline) return false;
  return (
    result.status === "ambiguous" ||
    result.status === "past_deadline" ||
    result.status === "invalid_deadline"
  );
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
  const initialDeadline = initialAction?.deadline
    ? toDatetimeLocalValue(initialAction.deadline)
    : "";
  const [sentence, setSentence] = useState(initialAction?.text ?? "");
  const [parseResult, setParseResult] = useState<NextActionParseResult>({
    status: "empty",
  });
  const [draftAction, setDraftAction] = useState(initialAction?.text ?? "");
  const [draftDeadline, setDraftDeadline] = useState(initialDeadline);
  const [deadlineSource, setDeadlineSource] = useState<DeadlineSource>(
    initialDeadline ? "initial" : null,
  );
  const deadlineSourceRef = useRef<DeadlineSource>(
    initialDeadline ? "initial" : null,
  );
  const [sentenceDirty, setSentenceDirty] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false);
  const resolvedBrowserTimeZone = browserTimeZoneOrUtc(browserTimeZone);

  function updateDeadline(value: string, source: DeadlineSource) {
    setDraftDeadline(value);
    setDeadlineSource(source);
    deadlineSourceRef.current = source;
  }

  useEffect(() => {
    if (!sentenceDirty) return;
    if (!sentence.trim()) {
      setParseResult({ status: "empty" });
      setDraftAction("");
      if (deadlineSourceRef.current === "parsed") {
        updateDeadline("", null);
      }
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
            updateDeadline(
              toDatetimeLocalValue(result.value.deadlineIso),
              "parsed",
            );
            return;
          }

          if (result.status === "missing_action") {
            setDraftAction("");
          } else {
            setDraftAction(sentence);
          }
          if (deadlineSourceRef.current === "parsed") {
            updateDeadline("", null);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setParseResult({ status: "empty" });
          setDraftAction(sentence);
          if (deadlineSourceRef.current === "parsed") {
            updateDeadline("", null);
          }
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
    parseDelayMs,
    parseSentence,
    referenceNow,
    resolvedBrowserTimeZone,
    sentence,
    sentenceDirty,
  ]);

  const draftDeadlineIso = datetimeLocalToIso(draftDeadline);
  const draftDeadlineIsPast = isPastStructuredDeadline(
    draftDeadlineIso,
    draftDeadline,
    initialAction,
    referenceNow(),
  );
  const hasAuthoritativeDeadline = Boolean(
    draftDeadlineIso &&
      (deadlineSource === "initial" || deadlineSource === "manual"),
  );
  const parseResultBlocksSave = blocksSave(
    parseResult,
    hasAuthoritativeDeadline,
  );
  const actionTooLong = draftAction.trim().length > 500;
  const draftIsValid = Boolean(
    draftAction.trim() &&
      !actionTooLong &&
      (!draftDeadline || draftDeadlineIso) &&
      !draftDeadlineIsPast &&
      !parseResultBlocksSave,
  );
  const canSave = draftIsValid && !parsing && !pending;
  const parsed = parseResult.status === "valid" ? parseResult.value : null;
  const parsedDeadlineGuidance =
    deadlineSource === "parsed" &&
    parsed &&
    draftDeadlineIso === parsed.deadlineIso
      ? parsed
      : null;
  const viewerOffset = parsedDeadlineGuidance
    ? offsetMinutesForTimeZone(
        parsedDeadlineGuidance.deadlineIso,
        resolvedBrowserTimeZone,
      )
    : null;
  const viewerPreview =
    parsedDeadlineGuidance &&
    viewerOffset !== parsedDeadlineGuidance.timezoneOffsetMinutes
      ? formatDeadlineInTimeZone(
          parsedDeadlineGuidance.deadlineIso,
          resolvedBrowserTimeZone,
        )
      : null;
  const statusMessage = draftDeadlineIsPast
    ? "Choose a future deadline."
    : parseResultBlocksSave
      ? parseStatusMessage(parseResult)
      : null;
  const hasStatusContent = Boolean(statusMessage || actionTooLong || error);
  const deadlineSelectionLabel = draftDeadlineIso
    ? formatDeadlineInTimeZone(draftDeadlineIso, resolvedBrowserTimeZone)
    : null;
  const deadlineButtonLabel = deadlineSelectionLabel
    ? `Deadline selected: ${deadlineSelectionLabel}. Change deadline`
    : "Add deadline";

  function save() {
    if (!canSave) return;
    onSave({
      text: draftAction.trim(),
      deadline: draftDeadlineIso,
    });
  }

  function handleSentenceChange(event: ChangeEvent<HTMLInputElement>) {
    const nextSentence = event.target.value;
    setSentence(nextSentence);
    setSentenceDirty(true);
    setParseResult({ status: "empty" });
    setDraftAction(nextSentence);
    if (deadlineSourceRef.current === "parsed") {
      updateDeadline("", null);
    }
    setParsing(Boolean(nextSentence.trim()));
  }

  function handleDeadlineChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDeadline = event.target.value;
    updateDeadline(nextDeadline, nextDeadline ? "manual" : null);
    setParseResult({ status: "empty" });
  }

  function clearDeadline() {
    updateDeadline("", null);
    setParseResult({ status: "empty" });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (deadlinePopoverOpen) {
        setDeadlinePopoverOpen(false);
        return;
      }
      onCancel();
      return;
    }
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.id !== "next-action-sentence") return;
    if (event.key === "Enter" && !event.shiftKey && canSave) {
      event.preventDefault();
      save();
    }
  }

  return (
    <div className="space-y-3" onKeyDown={handleComposerKeyDown}>
      <div className="space-y-2">
        <Label htmlFor="next-action-sentence">
          What should happen, and when?
        </Label>
        <div className="relative">
          <Input
            id="next-action-sentence"
            className="pr-12"
            value={sentence}
            maxLength={600}
            placeholder="Call Atul by next Friday at 5pm ET"
            aria-invalid={Boolean(statusMessage || actionTooLong)}
            aria-describedby={
              hasStatusContent ? "next-action-status" : undefined
            }
            onChange={handleSentenceChange}
          />
          <Popover
            open={deadlinePopoverOpen}
            onOpenChange={setDeadlinePopoverOpen}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground outline-none transition-[color,background-color,box-shadow,transform] after:absolute after:-inset-1 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
                  draftDeadlineIso
                    ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                    : "hover:bg-muted hover:text-foreground",
                )}
                aria-label={deadlineButtonLabel}
                data-deadline-selected={Boolean(draftDeadlineIso)}
              >
                <CalendarClock className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(20rem,calc(100vw-2rem))] space-y-3"
            >
              <div className="space-y-2">
                <Label htmlFor="next-action-deadline">
                  Deadline (your time)
                </Label>
                <Input
                  id="next-action-deadline"
                  type="datetime-local"
                  value={draftDeadline}
                  onChange={handleDeadlineChange}
                />
              </div>
              {draftDeadline && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={clearDeadline}
                >
                  <X className="h-4 w-4" />
                  Clear deadline
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {viewerPreview && (
        <p className="text-pretty text-xs tabular-nums text-muted-foreground">
          Deadline in your time: {viewerPreview}
        </p>
      )}

      {hasStatusContent && (
        <div
          id="next-action-status"
          role="status"
          aria-live="polite"
          className="min-w-0 space-y-1"
        >
          {statusMessage && (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words text-pretty">
                {statusMessage}
              </span>
            </p>
          )}
          {actionTooLong && (
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
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="relative after:absolute after:inset-x-0 after:-inset-y-1"
          disabled={!canSave}
          onClick={save}
        >
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
          size="sm"
          className="relative after:absolute after:inset-x-0 after:-inset-y-1"
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
