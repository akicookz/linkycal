import { getRenderableRichTextHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

interface RichTextContentProps {
  value: string | null | undefined;
  fallbackPlainText?: string | null;
  className?: string;
}

export function RichTextContent({
  value,
  fallbackPlainText,
  className,
}: RichTextContentProps) {
  const html = getRenderableRichTextHtml(value, fallbackPlainText);
  if (!html) return null;

  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_p:not(:last-child)]:mb-2 [&_strong]:font-semibold",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
