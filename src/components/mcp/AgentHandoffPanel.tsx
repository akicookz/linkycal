import { Check, Loader, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AgentClientStack } from "@/components/marketing/SetupAgentsLink";
import { McpConnectTabs } from "@/components/mcp/McpConnectInstructions";

interface AgentHandoffPanelProps {
  finishing: boolean;
  onFinish: () => void;
  onConnectOpen?: () => void;
}

export function AgentHandoffPanel({
  finishing,
  onFinish,
  onConnectOpen,
}: AgentHandoffPanelProps) {
  function handleOpenChange(open: boolean) {
    if (open) onConnectOpen?.();
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-[20px] bg-muted/50 p-4 sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-semibold">Hand it off to your agents</p>
          <AgentClientStack />
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          Your AI agents can take it from here, use the button on the right to
          get started.
        </p>
      </div>
      <div className="shrink-0">
        <Popover onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <PlugZap />
              Connect
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            collisionPadding={16}
            className="flex w-[min(32rem,calc(100vw-2rem))] max-h-[var(--radix-popover-content-available-height)] flex-col p-0"
          >
            <div className="space-y-1 p-5 pb-4">
              <p className="text-sm font-semibold">Connect your agent</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Add the MCP URL, sign in to LinkyCal, and pick this project.
                No API key needed.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              <McpConnectTabs />
            </div>
            <div className="flex flex-col gap-3 p-5 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Connected? Your agent takes it from here.
              </p>
              <Button onClick={onFinish} disabled={finishing}>
                {finishing ? <Loader className="animate-spin" /> : <Check />}
                Done, open dashboard
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
