import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "flex w-full min-w-0 text-base shadow-xs transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default:
          "min-h-16 rounded-[12px] border border-input bg-muted/50 px-3 py-2 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive",
        focused:
          "min-h-11 resize-none overflow-hidden rounded-[var(--radius)] border-0 bg-primary/[0.03] px-4 py-3 shadow-none ring-shadow placeholder:text-muted-foreground/45 focus:bg-primary/[0.045] focus:ring-shadow-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 aria-invalid:ring-shadow-[color-mix(in_srgb,var(--destructive)_60%,transparent)]",
      },
      size: {
        default: "",
        lg: "",
      },
    },
    compoundVariants: [
      {
        variant: "focused",
        size: "lg",
        class: "min-h-12 max-w-xl",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>
>(function Textarea({ className, variant, size, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(textareaVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { Textarea, textareaVariants };
