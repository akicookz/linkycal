import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isRichTextEmpty, sanitizeRichTextHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string | null | undefined;
  placeholder?: string;
  className?: string;
  onSave: (value: string | null) => void;
}

export function RichTextEditor({
  value,
  placeholder = "Write something...",
  className,
  onSave,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [draftValue, setDraftValue] = useState(
    () => sanitizeRichTextHtml(value) ?? "",
  );
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const nextValue = sanitizeRichTextHtml(value) ?? "";
    setDraftValue(nextValue);

    if (editorRef.current && editorRef.current.innerHTML !== nextValue) {
      editorRef.current.innerHTML = nextValue;
    }
  }, [value]);

  function syncDraftFromDom(): string {
    const nextValue = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? "") ?? "";
    setDraftValue(nextValue);

    if (editorRef.current && editorRef.current.innerHTML !== nextValue) {
      editorRef.current.innerHTML = nextValue;
    }

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

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleCommand("bold")}
        >
          <Bold className="h-3.5 w-3.5" />
          Bold
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleCommand("italic")}
        >
          <Italic className="h-3.5 w-3.5" />
          Italic
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleLink}
        >
          <Link2 className="h-3.5 w-3.5" />
          Link
        </Button>
      </div>

      <div className="relative">
        {!isFocused && isRichTextEmpty(draftValue) && (
          <span className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
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
          className="min-h-[132px] rounded-[16px] border bg-background px-3 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-primary/40 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_p:not(:last-child)]:mb-2 [&_strong]:font-semibold"
        />
      </div>
    </div>
  );
}
