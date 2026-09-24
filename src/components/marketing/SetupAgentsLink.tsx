import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { McpClientIcon } from "@/components/mcp/McpClientIcon";
import { cn } from "@/lib/utils";

const CLIENTS = ["Claude", "ChatGPT", "Lovable", "Cursor", "Base44"];

interface SetupAgentsLinkProps {
  className?: string;
}

interface AgentClientStackProps {
  className?: string;
}

export function AgentClientStack({ className }: AgentClientStackProps) {
  return (
    <span className={cn("flex items-center", className)} aria-hidden="true">
      {CLIENTS.map((clientName, index) => (
        <span key={clientName} title={clientName} className={index > 0 ? "-ml-1.5" : undefined}>
          <McpClientIcon
            clientName={clientName}
            className="size-7 rounded-full bg-white shadow-none ring-0 [&_img]:size-4"
          />
        </span>
      ))}
    </span>
  );
}

export function SetupAgentsLink({ className }: SetupAgentsLinkProps) {
  return (
    <Button variant="outline" size="lg" className={className} asChild>
      <Link
        to="/docs#mcp-connect"
        aria-label="Setup with your agents: Claude, ChatGPT, Lovable, Cursor, and Base44"
      >
        <span className="whitespace-nowrap">Setup with your agents</span>
        <AgentClientStack className="pl-1" />
      </Link>
    </Button>
  );
}
