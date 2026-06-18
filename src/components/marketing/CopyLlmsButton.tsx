import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, ClipboardCheck, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Onboarding timeline shown after the copy ────────────────────────────────

const STEPS = [
  "Sign up free and get your API key",
  "Paste this llms.txt into your website builder",
  "You're done. Your AI agent can take it from there",
];

interface CopyLlmsButtonProps {
  className?: string;
  iconClassName?: string;
}

export function CopyLlmsButton({ className, iconClassName = "w-4 h-4" }: CopyLlmsButtonProps) {
  const [open, setOpen] = useState(false);
  const [llmsText, setLlmsText] = useState("");

  // Prefetch the static file so the clipboard write stays synchronous inside
  // the click handler — Safari drops the user gesture across an awaited fetch.
  useEffect(() => {
    let active = true;
    fetch("/llms.txt")
      .then((res) => res.text())
      .then((text) => {
        if (active) setLlmsText(text);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function handleClick() {
    if (llmsText) {
      navigator.clipboard?.writeText(llmsText).catch(() => {});
    }
    setOpen(true);
  }

  return (
    <>
      <button type="button" onClick={handleClick} className={className}>
        <Copy className={iconClassName} />
        Copy llms.txt
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader className="items-start">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand/10 text-brand">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <DialogTitle className="mt-4">llms.txt is in your clipboard</DialogTitle>
            <DialogDescription className="mt-1">
              Three quick steps and your AI agent is wired into LinkyCal.
            </DialogDescription>
          </DialogHeader>

          <ol className="mt-2">
            {STEPS.map((step, index) => (
              <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-px bg-border"
                  />
                )}
                <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <p className="pt-1.5 text-sm leading-relaxed text-foreground">{step}</p>
              </li>
            ))}
          </ol>

          <Link
            to="/?show_auth=true"
            onClick={() => setOpen(false)}
            className="marketing-pill-cta h-12 w-full justify-center gap-2 text-sm font-medium"
          >
            Get your free API key
            <ArrowRight className="w-4 h-4" />
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
