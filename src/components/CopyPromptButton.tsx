import type { ComponentProps } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CopyPromptButtonItem {
  id: string;
  label: string;
  description: string;
  onClick: () => void;
  copied?: boolean;
}

interface CopyPromptButtonProps {
  items: CopyPromptButtonItem[];
  align?: "start" | "center" | "end";
  buttonVariant?: ComponentProps<typeof Button>["variant"];
  buttonSize?: ComponentProps<typeof Button>["size"];
  buttonClassName?: string;
}

export default function CopyPromptButton({
  items,
  align = "start",
  buttonVariant = "ghost",
  buttonSize = "sm",
  buttonClassName,
}: CopyPromptButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className={cn("h-8 px-2.5 text-xs", buttonClassName)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Copy prompt
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            className="w-full text-left rounded-[10px] px-3 py-2 hover:bg-muted/50 transition-colors"
            onClick={item.onClick}
          >
            <p className="text-sm font-medium">
              {item.copied ? "Copied!" : item.label}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {item.description}
            </p>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
