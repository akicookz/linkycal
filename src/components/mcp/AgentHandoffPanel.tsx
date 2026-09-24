import { useState } from "react";
import { Check, Loader, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AgentClientStack } from "@/components/marketing/SetupAgentsLink";
import { McpConnectTabs } from "@/components/mcp/McpConnectInstructions";
import { useIsMobile } from "@/hooks/use-mobile";

const CONNECT_TITLE = "Connect your agent";
const CONNECT_DESCRIPTION =
  "Add the MCP URL, sign in to LinkyCal, and pick this project. No API key needed.";

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
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) onConnectOpen?.();
  }

  const trigger = (
    <Button variant="outline" className="w-full sm:w-auto">
      <PlugZap />
      Connect
    </Button>
  );

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Connected? Your agent takes it from here.
      </p>
      <Button onClick={onFinish} disabled={finishing}>
        {finishing ? <Loader className="animate-spin" /> : <Check />}
        Done, open dashboard
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-semibold">Hand it off to your agents</p>
          <AgentClientStack />
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          Your AI agents can take it from here, use the button{" "}
          <span className="sm:hidden">below</span>
          <span className="hidden sm:inline">on the right</span> to get started.
        </p>
      </div>
      <div className="shrink-0">
        {isMobile ? (
          <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetTrigger asChild>{trigger}</SheetTrigger>
            <SheetContent
              side="bottom"
              hideCloseButton
              className="flex flex-col overflow-hidden rounded-t-[20px] px-0 pb-0 pt-1"
            >
              <SheetHeader className="mb-0 space-y-1 px-5 pb-4">
                <SheetTitle className="text-base">{CONNECT_TITLE}</SheetTitle>
                <SheetDescription className="text-xs leading-5">
                  {CONNECT_DESCRIPTION}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-5">
                <McpConnectTabs />
              </div>
              <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
              align="end"
              collisionPadding={16}
              className="flex w-[min(32rem,calc(100vw-2rem))] max-h-[var(--radix-popover-content-available-height)] flex-col p-0"
            >
              <div className="space-y-1 p-5 pb-4">
                <p className="text-sm font-semibold">{CONNECT_TITLE}</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {CONNECT_DESCRIPTION}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5">
                <McpConnectTabs />
              </div>
              <div className="p-5 pt-4">{footer}</div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
