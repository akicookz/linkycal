import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--control-radius)] text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "glow-surface",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "glow-surface-subtle text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-7 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
        lg: "h-11 px-7",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function isIconNode(node: React.ReactNode): boolean {
  if (typeof node === "string" || typeof node === "number") return false;
  if (!React.isValidElement(node)) return false;
  if (node.type === "svg") return true;

  const props = node.props as { className?: unknown; children?: React.ReactNode };
  const className = typeof props.className === "string" ? props.className : "";
  if (className.includes("lucide")) return true;

  if (typeof node.type !== "string") {
    const type = node.type as { displayName?: string; name?: string };
    const name = type.displayName ?? type.name ?? "";
    if (name === "Link" || name === "Slot" || name === "NavLink" || name === "Fragment") {
      return false;
    }
    const childArray = React.Children.toArray(props.children);
    const hasText = childArray.some((child) => typeof child === "string" && child.trim().length > 0);
    if (!hasText) return true;
  }

  if (node.type === "span" || node.type === "div") {
    const childArray = React.Children.toArray(props.children);
    return childArray.length > 0 && childArray.every((child) => isIconNode(child));
  }

  return false;
}

function visibleNodes(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).filter((node) => {
    // Children.toArray already drops null, undefined and booleans, so only
    // whitespace-only strings are left to filter out.
    if (typeof node === "string") return node.trim().length > 0;
    return true;
  });
}

interface ButtonSlots {
  left: React.ReactNode | null;
  text: React.ReactNode[];
  right: React.ReactNode | null;
}

function buttonSlots(children: React.ReactNode): ButtonSlots {
  const nodes = visibleNodes(children);
  let left: React.ReactNode | null = null;
  let right: React.ReactNode | null = null;
  let start = 0;
  let end = nodes.length;

  if (nodes.length > 0 && isIconNode(nodes[0])) {
    left = nodes[0];
    start = 1;
  }
  if (end > start && isIconNode(nodes[end - 1])) {
    right = nodes[end - 1];
    end -= 1;
  }

  return { left, text: nodes.slice(start, end), right };
}

function slottedChildren(slots: ButtonSlots): React.ReactNode {
  return (
    <>
      {slots.left != null && (
        <span className="inline-flex shrink-0 items-center justify-center">{slots.left}</span>
      )}
      <span className="min-w-0 w-full text-center">{slots.text}</span>
      {slots.right != null && (
        <span className="inline-flex shrink-0 items-center justify-center">{slots.right}</span>
      )}
    </>
  );
}

function textStartPad(size: ButtonProps["size"]): string {
  if (size === "lg") return "ps-7";
  if (size === "sm") return "ps-2.5";
  return "ps-5";
}

function textEndPad(size: ButtonProps["size"]): string {
  if (size === "lg") return "pe-7";
  if (size === "sm") return "pe-2.5";
  return "pe-5";
}

function slotLayoutClass(
  slots: ButtonSlots,
  size: ButtonProps["size"],
): string | undefined {
  if ((slots.left == null && slots.right == null) || slots.text.length === 0) {
    return undefined;
  }

  if (slots.left != null && slots.right != null) {
    return "inline-grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4";
  }
  if (slots.right != null) {
    return cn(
      "inline-grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-0 pe-2",
      textStartPad(size),
    );
  }
  return cn(
    "inline-grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-0 ps-4",
    textEndPad(size),
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, asChild = false, children, ...props },
    ref,
  ) {
    const Comp = asChild ? Slot : "button";
    let content = children;
    let layoutClass: string | undefined;
    const layoutSource =
      asChild && React.isValidElement(children)
        ? (children as React.ReactElement<{ children?: React.ReactNode }>).props.children
        : children;

    if (size !== "icon") {
      const slots = buttonSlots(layoutSource);
      layoutClass = slotLayoutClass(slots, size);
      if (layoutClass) {
        const slotted = slottedChildren(slots);
        if (asChild && React.isValidElement(children)) {
          content = React.cloneElement(children, undefined, slotted);
        } else {
          content = slotted;
        }
      }
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), layoutClass, className)}
        ref={ref}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
