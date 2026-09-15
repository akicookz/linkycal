import { Link } from "react-router-dom";
import { McpClientIcon } from "@/components/mcp/McpClientIcon";

const CLIENTS = ["Claude", "ChatGPT", "Lovable", "Cursor", "Base44"];

interface SetupAgentsLinkProps {
  className?: string;
}

export function SetupAgentsLink({ className }: SetupAgentsLinkProps) {
  return (
    <Link
      to="/docs#mcp-connect"
      className={`inline-flex min-h-10 items-center gap-3 ${className ?? ""}`}
      aria-label="Setup with your agents: Claude, ChatGPT, Lovable, Cursor, and Base44"
    >
      <span className="whitespace-nowrap">Setup with your agents</span>
      <span className="flex items-center pl-1" aria-hidden="true">
        {CLIENTS.map((clientName, index) => (
          <span key={clientName} title={clientName} className={index > 0 ? "-ml-1.5" : undefined}>
            <McpClientIcon
              clientName={clientName}
              className="size-7 rounded-full bg-white shadow-none ring-0 [&_img]:size-4"
            />
          </span>
        ))}
      </span>
    </Link>
  );
}
