import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Heart,
  MousePointer2,
  PlugZap,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface McpClientIconProps {
  clientName: string;
  className?: string;
}

interface ClientIconStyle {
  icon: LucideIcon;
  className: string;
}

function clientIconStyle(clientName: string): ClientIconStyle {
  const normalized = clientName.toLowerCase();
  if (normalized.includes("claude")) {
    return { icon: Sparkles, className: "text-[#D97757]" };
  }
  if (normalized.includes("chatgpt")) {
    return { icon: Bot, className: "text-[#10A37F]" };
  }
  if (normalized.includes("cursor")) {
    return { icon: MousePointer2, className: "text-foreground" };
  }
  if (normalized.includes("lovable")) {
    return { icon: Heart, className: "text-[#E855A5]" };
  }
  return { icon: PlugZap, className: "text-primary" };
}

export function McpClientIcon({
  clientName,
  className,
}: McpClientIconProps) {
  const style = clientIconStyle(clientName);
  const Icon = style.icon;

  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-background shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className={cn("size-5", style.className)} />
    </span>
  );
}
