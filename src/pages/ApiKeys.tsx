import { useParams } from "react-router-dom";

import PageHeader from "@/components/PageHeader";
import { RestApiKeys } from "@/components/api-keys/RestApiKeys";
import { ConnectedMcpClients } from "@/components/mcp/ConnectedMcpClients";
import { McpConnectInstructions } from "@/components/mcp/McpConnectInstructions";

export default function ApiKeys() {
  const { projectId = "" } = useParams<{ projectId: string }>();

  return (
    <div>
      <PageHeader
        title="MCP & APIs"
        description="Connect AI clients with OAuth and manage server-side REST API keys."
      />
      <div className="space-y-6">
        <ConnectedMcpClients projectId={projectId} />
        <McpConnectInstructions />
        <RestApiKeys projectId={projectId} />
      </div>
    </div>
  );
}
