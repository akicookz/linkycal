import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";

interface CopyableFieldProps {
  label: string;
  value: string;
}

export function CopyableField({ label, value }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p className="text-sm text-foreground break-words">{value || "—"}</p>
      </div>
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 mt-4 p-1 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
