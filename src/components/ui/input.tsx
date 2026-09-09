import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "w-full min-w-0 text-base shadow-xs transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default:
          "h-9 rounded-[12px] border border-border bg-muted/50 px-3 py-1 selection:bg-primary selection:text-primary-foreground md:h-10 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        focused:
          "h-11 rounded-[var(--radius)] border-0 bg-primary/[0.03] px-4 shadow-none ring-shadow placeholder:text-muted-foreground/45 focus:bg-primary/[0.045] focus:ring-shadow-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 aria-invalid:ring-shadow-[color-mix(in_srgb,var(--destructive)_60%,transparent)]",
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
        class: "h-12 max-w-xl",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Input({
  className,
  type,
  variant,
  size,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
