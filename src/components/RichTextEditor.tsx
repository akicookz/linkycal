import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isRichTextEmpty, sanitizeRichTextHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string | null | undefined;
  placeholder?: string;
  className?: string;
  // "compact" renders seamless inline text (no border, no fixed height) and
  // only shows the formatting toolbar while editing — for in-canvas editing.
  variant?: "default" | "compact";
  autoFocus?: boolean;
  onSave: (value: string | null) => void;
}

export function RichTextEditor({
  value,
  placeholder = "Write something...",
  className,
  variant = "default",
  autoFocus = false,
  onSave,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [draftValue, setDraftValue] = useState(
    () => sanitizeRichTextHtml(value) ?? "",
  );
  const [isFocused, setIsFocused] = useState(false);
  const isCompact = variant === "compact";

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Don't adopt an external `value` change while the user is focused/typing.
    // A background cache update (e.g. the server response to a sibling field
    // save) would otherwise reset the contentEditable and blow away the
    // draft — including collapsing the caret back to the start.
    if (isFocused) return;

    const nextValue = sanitizeRichTextHtml(value) ?? "";
    setDraftValue(nextValue);

    if (editorRef.current && editorRef.current.innerHTML !== nextValue) {
      editorRef.current.innerHTML = nextValue;
    }
  }, [value, isFocused]);

  function syncDraftFromDom(): string {
    // Never re-assign innerHTML here: even identical-looking reassignment
    // collapses the caret to the start of the contentEditable in every
    // browser. The external useEffect above handles DOM resets when the
    // `value` prop changes. Sanitization applied at save-time is enough.
    const nextValue = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? "") ?? "";
    setDraftValue(nextValue);
    return nextValue;
  }

  function handleCommand(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    syncDraftFromDom();
  }

  function handleLink() {
    editorRef.current?.focus();

    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      return;
    }

    const url = window.prompt("Enter a link URL", "https://");
    if (!url) return;

    document.execCommand("createLink", false, url.trim());
    syncDraftFromDom();
  }

  function handleBlur() {
    setIsFocused(false);

    const nextValue = syncDraftFromDom();
    const currentValue = sanitizeRichTextHtml(value) ?? "";
    if (nextValue !== currentValue) {
      onSave(nextValue || null);
    }
  }

  const toolbarButton = isCompact
    ? "h-6 px-2 text-[11px]"
    : "h-8 px-2.5 text-xs";
  const toolbar = (
    <div className={cn("flex flex-wrap", isCompact ? "gap-1" : "gap-2")}>
      <Button
        type="button"
        variant={isCompact ? "ghost" : "outline"}
        size="sm"
        className={toolbarButton}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => handleCommand("bold")}
      >
        <Bold className="h-3.5 w-3.5" />
        Bold
      </Button>
      <Button
        type="button"
        variant={isCompact ? "ghost" : "outline"}
        size="sm"
        className={toolbarButton}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => handleCommand("italic")}
      >
        <Italic className="h-3.5 w-3.5" />
        Italic
      </Button>
      <Button
        type="button"
        variant={isCompact ? "ghost" : "outline"}
        size="sm"
        className={toolbarButton}
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleLink}
      >
        <Link2 className="h-3.5 w-3.5" />
        Link
      </Button>
    </div>
  );

  return (
    <div className={cn(!isCompact && "space-y-2", className)}>
      {!isCompact && toolbar}

      <div className="relative">
        {/* Floating formatting bubble while editing (compact mode) */}
        {isCompact && isFocused && (
          <div className="absolute -top-1.5 left-0 z-20 -translate-y-full rounded-[10px] border bg-background p-0.5 shadow-md">
            {toolbar}
          </div>
        )}
        {!isFocused && isRichTextEmpty(draftValue) && (
          <span
            className={cn(
              "pointer-events-none absolute text-muted-foreground",
              isCompact
                ? "left-0 top-0.5 text-base text-muted-foreground/60"
                : "left-3 top-3 text-sm",
            )}
          >
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setIsFocused(true)}
          onInput={() => {
            syncDraftFromDom();
          }}
          onBlur={handleBlur}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            syncDraftFromDom();
          }}
          className={cn(
            "leading-relaxed outline-none transition-colors [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_p:not(:last-child)]:mb-2 [&_strong]:font-semibold",
            isCompact
              ? // Mirror InlineEditableLabel's affordance so title and
                // description feel like one editing surface.
                "min-h-[1.75rem] border-0 border-b border-dashed border-transparent bg-transparent py-0.5 text-base text-muted-foreground hover:border-muted-foreground/30 focus:border-solid focus:border-primary"
              : "min-h-[132px] rounded-[16px] border bg-background px-3 py-3 text-sm focus:border-primary/40",
          )}
        />
      </div>
    </div>
  );
}
