import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  MCP_TOOL_DISCOVERY,
  MCP_TOOL_SCOPES,
  type McpToolName,
  type McpToolScope,
} from "../../shared/mcp-tools";
import type { ToolContext } from "./agent";
import { registerAnalyticsTools } from "./tools/analytics";
import { registerActivityTools } from "./tools/activity";
import { registerBookingTools } from "./tools/bookings";
import { registerCalendarTools } from "./tools/calendars";
import { registerContactTools } from "./tools/contacts";
import { registerContactViewTools } from "./tools/contact-views";
import { registerEventTypeTools } from "./tools/event-types";
import { registerFormTools } from "./tools/forms";
import { registerProjectAssetTools } from "./tools/project-assets";
import { registerProjectTools } from "./tools/projects";
import { registerScheduleTools } from "./tools/schedules";
import { registerWorkflowTools } from "./tools/workflows";

function toolInventory(scope: McpToolScope): string {
  const domains = new Map<string, McpToolName[]>();

  for (const [name, toolScope] of Object.entries(MCP_TOOL_SCOPES) as Array<
    [McpToolName, McpToolScope]
  >) {
    if (toolScope !== scope) continue;
    const domain = MCP_TOOL_DISCOVERY[name].domain;
    domains.set(domain, [...(domains.get(domain) ?? []), name]);
  }

  return Array.from(domains.entries())
    .map(function domainInventory(entry) {
      return `- ${entry[0]}: ${entry[1].join(", ")}`;
    })
    .join("\n");
}

export const MCP_SERVER_INSTRUCTIONS = `# LinkyCal MCP

This connection is already authorized for exactly one LinkyCal project. Every tool is project-scoped. Do not send a projectId, use REST API keys, or assume access to another project.

## Tool discovery

Tools are grouped by their display title and MCP annotations. Stable tool IDs are kept for compatibility.

### Read tools

Titles start with \`Read ·\` and \`readOnlyHint\` is true. Use these tools to discover resource IDs and inspect current state before acting:
${toolInventory("read")}

### Write tools

Titles start with \`Write ·\` and \`readOnlyHint\` is false. Tools with \`destructiveHint\` can remove data or reject/cancel an existing state:
${toolInventory("write")}

## Operating rules

1. Never invent resource IDs. Start with the relevant list tool, then use a get tool when the current state matters.
2. Before a destructive write, verify the target with a read tool and obtain confirmation unless the user's request already explicitly authorizes that exact action.
3. Treat write tools with \`openWorldHint\` as externally visible. They can send email, update Google Calendar, or trigger configured workflows.
4. Successful results return JSON in \`content\`; prefer \`structuredContent\` when a result provides it. If \`isError\` is true, report the error and do not claim the action succeeded. Entitlement denials include \`structuredContent.entitlementError\`.
5. Dates use YYYY-MM-DD. Instants use ISO 8601 UTC. Timezones use IANA names such as Asia/Seoul or America/New_York.

## Examples

- Book an available meeting: list_event_types → get_available_slots → create_booking. Pass create_booking an exact UTC slot returned by get_available_slots.
- Find and tag a contact: list_contacts → list_contact_tags → add_tag_to_contact. Use the returned contact and tag IDs.
- Change working hours: list_schedules → get_schedule → set_schedule_rules, then add_schedule_override for date exceptions.
- Build a form: create_form → create_form_step → create_form_field → update_form with status active.
- Inspect submissions: list_forms → list_form_responses → get_form_response; use get_form_response_file for private uploads.
- Route a meeting to calendars: list_project_calendars → get_event_type_calendars → update_event_type_calendars.
- Run an automation: list_workflows → get_workflow → trigger_workflow, then list_workflow_runs → get_workflow_run.
- Review a funnel: list_event_types or list_forms to resolve the resource ID, then call the matching analytics tool with the requested period and filters.

## Further documentation

- Human-readable API documentation: https://linkycal.com/docs
- AI-oriented full inventory and examples: https://linkycal.com/llms.txt
- OpenAPI 3.1 contract for related REST workflows: https://linkycal.com/openapi.json
`;

export function createLinkyCalMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    {
      name: "linkycal",
      title: "LinkyCal — Forms & Scheduling",
      version: "1.0.0",
    },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );

  registerBookingTools(server, ctx);
  registerProjectTools(server, ctx);
  registerProjectAssetTools(server, ctx);
  registerCalendarTools(server, ctx);
  registerContactTools(server, ctx);
  registerContactViewTools(server, ctx);
  registerEventTypeTools(server, ctx);
  registerScheduleTools(server, ctx);
  registerFormTools(server, ctx);
  registerWorkflowTools(server, ctx);
  registerAnalyticsTools(server, ctx);
  registerActivityTools(server, ctx);

  return server;
}
