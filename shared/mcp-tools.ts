export type McpToolScope = "read" | "write";
export type McpOAuthScope = McpToolScope | "offline_access";

export const MCP_TOOL_SCOPES = {
  list_bookings: "read",
  get_booking: "read",
  get_available_slots: "read",
  create_booking: "write",
  cancel_booking: "write",
  confirm_booking: "write",
  decline_booking: "write",
  list_event_types: "read",
  get_event_type: "read",
  create_event_type: "write",
  update_event_type: "write",
  list_schedules: "read",
  get_schedule: "read",
  list_contacts: "read",
  get_contact: "read",
  create_contact: "write",
  update_contact: "write",
  set_contact_next_action: "write",
  complete_contact_next_action: "write",
  delete_contact: "write",
  list_contact_tags: "read",
  get_contact_tag: "read",
  create_contact_tag: "write",
  update_contact_tag: "write",
  delete_contact_tag: "write",
  add_tag_to_contact: "write",
  remove_tag_from_contact: "write",
  get_contact_activity: "read",
  list_forms: "read",
  get_form: "read",
  create_form: "write",
  update_form: "write",
  list_form_responses: "read",
  list_workflows: "read",
  get_workflow: "read",
  get_analytics_overview: "read",
  get_booking_funnel_analytics: "read",
  get_form_funnel_analytics: "read",
  list_analytics_integrations: "read",
  configure_analytics_integration: "write",
} as const satisfies Record<string, McpToolScope>;

export type McpToolName = keyof typeof MCP_TOOL_SCOPES;

export interface McpToolDiscovery {
  domain: string;
  title: string;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export const MCP_TOOL_DISCOVERY = {
  list_bookings: { domain: "Bookings", title: "List bookings" },
  get_booking: { domain: "Bookings", title: "Get booking" },
  get_available_slots: {
    domain: "Bookings",
    title: "Get available slots",
    openWorldHint: true,
  },
  create_booking: {
    domain: "Bookings",
    title: "Create booking",
    destructiveHint: false,
    openWorldHint: true,
  },
  cancel_booking: {
    domain: "Bookings",
    title: "Cancel booking",
    destructiveHint: true,
    openWorldHint: true,
  },
  confirm_booking: {
    domain: "Bookings",
    title: "Confirm booking",
    openWorldHint: true,
  },
  decline_booking: {
    domain: "Bookings",
    title: "Decline booking",
    destructiveHint: true,
    openWorldHint: true,
  },
  list_event_types: { domain: "Event types", title: "List event types" },
  get_event_type: { domain: "Event types", title: "Get event type" },
  create_event_type: {
    domain: "Event types",
    title: "Create event type",
    destructiveHint: false,
  },
  update_event_type: {
    domain: "Event types",
    title: "Update event type",
    idempotentHint: true,
  },
  list_schedules: { domain: "Schedules", title: "List schedules" },
  get_schedule: { domain: "Schedules", title: "Get schedule" },
  list_contacts: { domain: "Contacts", title: "List contacts" },
  get_contact: { domain: "Contacts", title: "Get contact" },
  create_contact: {
    domain: "Contacts",
    title: "Create contact",
    destructiveHint: false,
    openWorldHint: true,
  },
  update_contact: {
    domain: "Contacts",
    title: "Update contact",
    idempotentHint: true,
  },
  set_contact_next_action: {
    domain: "Contacts",
    title: "Set contact next action",
  },
  complete_contact_next_action: {
    domain: "Contacts",
    title: "Complete contact next action",
    idempotentHint: true,
  },
  delete_contact: {
    domain: "Contacts",
    title: "Delete contact",
    destructiveHint: true,
  },
  list_contact_tags: { domain: "Tags", title: "List contact tags" },
  get_contact_tag: { domain: "Tags", title: "Get contact tag" },
  create_contact_tag: {
    domain: "Tags",
    title: "Create contact tag",
    destructiveHint: false,
  },
  update_contact_tag: {
    domain: "Tags",
    title: "Update contact tag",
    idempotentHint: true,
  },
  delete_contact_tag: {
    domain: "Tags",
    title: "Delete contact tag",
    destructiveHint: true,
  },
  add_tag_to_contact: {
    domain: "Tags",
    title: "Add tag to contact",
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  remove_tag_from_contact: {
    domain: "Tags",
    title: "Remove tag from contact",
    destructiveHint: true,
    idempotentHint: true,
  },
  get_contact_activity: { domain: "Contacts", title: "Get contact activity" },
  list_forms: { domain: "Forms", title: "List forms" },
  get_form: { domain: "Forms", title: "Get form" },
  create_form: {
    domain: "Forms",
    title: "Create form",
    destructiveHint: false,
  },
  update_form: {
    domain: "Forms",
    title: "Update form",
    idempotentHint: true,
  },
  list_form_responses: { domain: "Forms", title: "List form responses" },
  list_workflows: { domain: "Workflows", title: "List workflows" },
  get_workflow: { domain: "Workflows", title: "Get workflow" },
  get_analytics_overview: {
    domain: "Analytics",
    title: "Get analytics overview",
  },
  get_booking_funnel_analytics: {
    domain: "Analytics",
    title: "Get booking funnel analytics",
  },
  get_form_funnel_analytics: {
    domain: "Analytics",
    title: "Get form funnel analytics",
  },
  list_analytics_integrations: {
    domain: "Analytics",
    title: "List analytics integrations",
  },
  configure_analytics_integration: {
    domain: "Analytics",
    title: "Configure analytics integration",
    idempotentHint: true,
  },
} as const satisfies Record<McpToolName, McpToolDiscovery>;
