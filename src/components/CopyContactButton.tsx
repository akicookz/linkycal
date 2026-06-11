import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyContactButtonProps {
  name: string;
  email: string;
  className?: string;
}

// Copies "Name <email>" so a contact can be pasted straight into a mail
// client. Hidden until a `group/contact` ancestor is hovered.
export default function CopyContactButton({
  name,
  email,
  className,
}: CopyContactButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    void navigator.clipboard.writeText(`${name} <${email}>`);
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      title="Copy name and email"
      aria-label={`Copy name and email for ${name}`}
      onClick={handleCopy}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground transition-opacity hover:text-foreground opacity-0 group-hover/contact:opacity-100 focus-visible:opacity-100",
        copied && "opacity-100",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3 w-3 text-primary" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
