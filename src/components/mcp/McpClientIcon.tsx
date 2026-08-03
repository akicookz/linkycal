import { PlugZap } from "lucide-react";

import { cn } from "@/lib/utils";

interface McpClientIconProps {
  clientName: string;
  className?: string;
}

function clientLogoPath(clientName: string): string | null {
  const normalized = clientName.toLowerCase();
  if (normalized.includes("claude")) {
    return "/mcp-client-logos/claude.svg";
  }
  if (normalized.includes("chatgpt")) {
    return "/mcp-client-logos/chatgpt.svg";
  }
  if (normalized.includes("cursor")) {
    return "/mcp-client-logos/cursor.svg";
  }
  if (normalized.includes("lovable")) {
    return "/mcp-client-logos/lovable.svg";
  }
  return null;
}

export function McpClientIcon({
  clientName,
  className,
}: McpClientIconProps) {
  const logoPath = clientLogoPath(clientName);

  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-background shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      {logoPath ? (
        <img src={logoPath} alt="" className="size-5 object-contain" />
      ) : (
        <PlugZap className="size-5 text-primary" />
      )}
    </span>
  );
}
