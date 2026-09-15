import { Link } from "react-router-dom";
import { McpClientIcon } from "@/components/mcp/McpClientIcon";

const CLIENTS = ["Claude", "ChatGPT", "Lovable", "Cursor"];

interface SetupAgentsLinkProps {
  className?: string;
}

export function SetupAgentsLink({ className }: SetupAgentsLinkProps) {
  return (
    <Link
      to="/docs#mcp-connect"
      className={`inline-flex min-h-10 items-center gap-3 ${className ?? ""}`}
      aria-label="Setup with your agents: Claude, ChatGPT, Lovable, and Cursor"
    >
      <span>Setup with your agents</span>
      <span className="flex items-center pl-1" aria-hidden="true">
        {CLIENTS.map((clientName, index) => (
          <span key={clientName} title={clientName} className={index > 0 ? "-ml-1.5" : undefined}>
            <McpClientIcon
              clientName={clientName}
              className="size-7 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.14)] ring-1 ring-brand [&_img]:size-4"
            />
          </span>
        ))}
      </span>
    </Link>
  );
}
