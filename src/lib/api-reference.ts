export type ApiReferenceMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiReferenceOperation {
  method: ApiReferenceMethod;
  path: string;
  description: string;
}

export interface ApiReferenceSection {
  id: string;
  title: string;
  description: string;
  notes: string[];
  operations: ApiReferenceOperation[];
}

const PROJECT_BASE = "/api/projects/:projectId";

export const API_REFERENCE_SECTIONS: ApiReferenceSection[] = [
  {
    id: "project-api",
    title: "Projects and entitlements",
    description:
      "Read and update the project addressed by the API key, and inspect the plan limits that apply to it.",
    notes: [
      "Project creation and deletion remain dashboard-only.",
      "PUT accepts name, slug, timezone, and onboarded; slugs use lowercase letters, digits, and hyphens.",
      "Entitlements are the source of truth for API access and resource limits; do not hard-code plan assumptions.",
    ],
    operations: [
      { method: "GET", path: PROJECT_BASE, description: "Get the current project." },
      { method: "PUT", path: PROJECT_BASE, description: "Update project settings and branding." },
      {
        method: "GET",
        path: `${PROJECT_BASE}/entitlements`,
        description: "Get the subscription, usage, and effective plan limits.",
      },
    ],
  },
  {
    id: "event-types-api",
    title: "Event types",
    description:
      "Manage bookable meeting definitions and choose which connected calendars each event type reads and writes.",
    notes: [
      "Event type writes are subject to the project plan limit.",
      "Create with name, slug, duration, and optional description, location, color, buffers, booking caps, confirmation mode, bookingFormId, settings, or copyFromEventTypeId.",
      "Calendar IDs must belong to a connection available to the project or its team.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/event-types`, description: "List event types." },
      { method: "POST", path: `${PROJECT_BASE}/event-types`, description: "Create an event type." },
      { method: "GET", path: `${PROJECT_BASE}/event-types/:eventTypeId`, description: "Get an event type." },
      { method: "PUT", path: `${PROJECT_BASE}/event-types/:eventTypeId`, description: "Update an event type." },
      { method: "DELETE", path: `${PROJECT_BASE}/event-types/:eventTypeId`, description: "Delete an event type." },
      {
        method: "GET",
        path: `${PROJECT_BASE}/event-types/:eventTypeId/calendars`,
        description: "Get destination and availability calendar selections.",
      },
      {
        method: "PUT",
        path: `${PROJECT_BASE}/event-types/:eventTypeId/calendars`,
        description: "Replace destination and availability calendar selections.",
      },
    ],
  },
  {
    id: "schedules-api",
    title: "Schedules and availability rules",
    description:
      "Manage reusable schedules, their weekly working windows, and date-specific availability overrides.",
    notes: [
      "Times in rules and overrides are local to the schedule timezone.",
      "Create schedules with name, timezone, and isDefault. Rules contain dayOfWeek, startTime, and endTime; 24:00 is valid only as an end time.",
      "Replacing rules uses the complete submitted rule set; read the current rules before editing.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/schedules`, description: "List schedules." },
      { method: "POST", path: `${PROJECT_BASE}/schedules`, description: "Create a schedule." },
      { method: "PUT", path: `${PROJECT_BASE}/schedules/:scheduleId`, description: "Update a schedule." },
      { method: "DELETE", path: `${PROJECT_BASE}/schedules/:scheduleId`, description: "Delete a schedule." },
      { method: "GET", path: `${PROJECT_BASE}/schedules/:scheduleId/rules`, description: "List weekly availability rules." },
      { method: "PUT", path: `${PROJECT_BASE}/schedules/:scheduleId/rules`, description: "Replace weekly availability rules." },
      { method: "GET", path: `${PROJECT_BASE}/schedules/:scheduleId/overrides`, description: "List date overrides." },
      { method: "POST", path: `${PROJECT_BASE}/schedules/:scheduleId/overrides`, description: "Create a date override." },
      {
        method: "DELETE",
        path: `${PROJECT_BASE}/schedules/:scheduleId/overrides/:overrideId`,
        description: "Delete a date override.",
      },
    ],
  },
  {
    id: "booking-management-api",
    title: "Booking management",
    description:
      "Read bookings created by visitor flows and perform organizer-side state transitions.",
    notes: [
      "Confirmation and cancellation may update Google Calendar and send email.",
      "Cancellation accepts an optional reason. Decline accepts an optional reason and notify flag; confirmation requires no request body.",
      "The visitor booking creation endpoint is documented separately under Booking API.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/bookings`, description: "List project bookings." },
      { method: "GET", path: `${PROJECT_BASE}/bookings/:bookingId`, description: "Get a booking." },
      {
        method: "PATCH",
        path: `${PROJECT_BASE}/bookings/:bookingId/cancel`,
        description: "Cancel a booking and optionally record a reason.",
      },
      {
        method: "PATCH",
        path: `${PROJECT_BASE}/bookings/:bookingId/confirm`,
        description: "Confirm a pending booking.",
      },
      {
        method: "PATCH",
        path: `${PROJECT_BASE}/bookings/:bookingId/decline`,
        description: "Decline a pending booking.",
      },
      {
        method: "GET",
        path: `${PROJECT_BASE}/bookings/:bookingId/form-response`,
        description: "Get the intake form response attached to a booking.",
      },
    ],
  },
  {
    id: "form-management-api",
    title: "Forms and responses",
    description:
      "Manage forms, ordered steps and fields, submitted responses, and private response files.",
    notes: [
      "Reorder endpoints accept the complete ordered list of IDs.",
      "Forms use name, slug, type, status, and settings. Steps contain display and visibility data; fields contain type, label, validation, options, contact mapping, and visibility.",
      "Deleting a response removes its stored values and owned response files.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/forms`, description: "List forms." },
      { method: "POST", path: `${PROJECT_BASE}/forms`, description: "Create a form." },
      { method: "GET", path: `${PROJECT_BASE}/forms/:formId`, description: "Get a form with its structure." },
      { method: "PUT", path: `${PROJECT_BASE}/forms/:formId`, description: "Update a form." },
      { method: "DELETE", path: `${PROJECT_BASE}/forms/:formId`, description: "Delete a form." },
      { method: "GET", path: `${PROJECT_BASE}/forms/:formId/steps`, description: "List form steps." },
      { method: "POST", path: `${PROJECT_BASE}/forms/:formId/steps`, description: "Create a form step." },
      { method: "PUT", path: `${PROJECT_BASE}/forms/:formId/steps/:stepId`, description: "Update a form step." },
      { method: "DELETE", path: `${PROJECT_BASE}/forms/:formId/steps/:stepId`, description: "Delete a form step." },
      { method: "PUT", path: `${PROJECT_BASE}/forms/:formId/steps/reorder`, description: "Reorder form steps." },
      { method: "GET", path: `${PROJECT_BASE}/forms/:formId/fields`, description: "List form fields." },
      { method: "POST", path: `${PROJECT_BASE}/forms/:formId/fields`, description: "Create a form field." },
      { method: "PUT", path: `${PROJECT_BASE}/forms/:formId/fields/:fieldId`, description: "Update a form field." },
      { method: "DELETE", path: `${PROJECT_BASE}/forms/:formId/fields/:fieldId`, description: "Delete a form field." },
      { method: "PUT", path: `${PROJECT_BASE}/forms/:formId/fields/reorder`, description: "Reorder form fields." },
      { method: "GET", path: `${PROJECT_BASE}/forms/:formId/responses`, description: "List form responses." },
      { method: "GET", path: `${PROJECT_BASE}/forms/:formId/responses/:responseId`, description: "Get a form response." },
      {
        method: "GET",
        path: `${PROJECT_BASE}/forms/:formId/responses/:responseId/files/:valueId`,
        description: "Download a private response file.",
      },
      {
        method: "GET",
        path: "/api/v1/forms/:projectSlug/:formSlug/responses/:responseId/files/:valueId",
        description: "Download a private response file through the project-scoped API-key route.",
      },
      {
        method: "DELETE",
        path: `${PROJECT_BASE}/form-responses/:responseId`,
        description: "Delete a form response.",
      },
    ],
  },
  {
    id: "contact-management-api",
    title: "Contact management",
    description:
      "Manage CRM records, saved list and Kanban views, activity, next actions, stages, imports, and enrichment.",
    notes: [
      "Contact listing defaults to 50 records and returns { contacts, total }; use limit and offset to load more.",
      "Supported filters include search, tagId, repeated tagIds, matchAllTags, stageTagId, repeated excludeStageTagIds, activityType, activitySinceDays, noActivitySinceDays, and bookingStatus.",
      "Contact writes support name, email, phone, notes, metadata, company, companyWebsite, position, companySize, estimatedRevenue, and linkedinUrl. Set next action with { text, deadline }; send both as null to complete it.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/contacts`, description: "List and filter contacts." },
      { method: "POST", path: `${PROJECT_BASE}/contacts`, description: "Create a contact." },
      { method: "POST", path: `${PROJECT_BASE}/contacts/import`, description: "Import mapped contact rows." },
      { method: "GET", path: `${PROJECT_BASE}/contacts/:contactId`, description: "Get a contact with tags." },
      { method: "PUT", path: `${PROJECT_BASE}/contacts/:contactId`, description: "Update a contact." },
      { method: "DELETE", path: `${PROJECT_BASE}/contacts/:contactId`, description: "Delete a contact." },
      {
        method: "GET",
        path: `${PROJECT_BASE}/contacts/:contactId/activities`,
        description: "List the cursor-paginated contact timeline and category counts.",
      },
      {
        method: "PUT",
        path: `${PROJECT_BASE}/contacts/:contactId/next-action`,
        description: "Set, replace, or complete the contact's next action.",
      },
      { method: "POST", path: `${PROJECT_BASE}/contacts/:contactId/stage`, description: "Move a contact between stage tags." },
      { method: "POST", path: `${PROJECT_BASE}/contacts/:contactId/enrich`, description: "Run contact research and return the enriched contact." },
      { method: "GET", path: `${PROJECT_BASE}/contact-views`, description: "List saved contact views." },
      { method: "POST", path: `${PROJECT_BASE}/contact-views`, description: "Create a saved contact view." },
      { method: "PUT", path: `${PROJECT_BASE}/contact-views/:viewId`, description: "Update a saved contact view." },
      { method: "DELETE", path: `${PROJECT_BASE}/contact-views/:viewId`, description: "Delete a saved contact view." },
      { method: "POST", path: `${PROJECT_BASE}/pipeline/seed`, description: "Create the default pipeline stages when missing." },
    ],
  },
  {
    id: "tags-api",
    title: "Tags",
    description:
      "Create project tags and assign them to contacts. Names are unique within a project after trimming and case normalization.",
    notes: [
      "List tags with search and optional cursor pagination. A cursor requires the same limit on the next request.",
      "PUT assignment and DELETE removal are idempotent: assigned or removed is false when no relationship changed.",
      "Deleting a workflow-referenced tag returns 409 TAG_IN_USE with the workflows that block deletion.",
      "POST assignment is retained for compatibility; new integrations should use the canonical PUT endpoint.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/tags`, description: "List tags with search and cursor pagination." },
      { method: "POST", path: `${PROJECT_BASE}/tags`, description: "Create a tag from name and optional #RRGGBB color." },
      { method: "GET", path: `${PROJECT_BASE}/tags/:tagId`, description: "Get a tag." },
      { method: "PATCH", path: `${PROJECT_BASE}/tags/:tagId`, description: "Update a tag's name or color." },
      { method: "DELETE", path: `${PROJECT_BASE}/tags/:tagId`, description: "Delete an unused tag." },
      {
        method: "POST",
        path: `${PROJECT_BASE}/contacts/:contactId/tags`,
        description: "Legacy assignment endpoint accepting { tagId }.",
      },
      {
        method: "PUT",
        path: `${PROJECT_BASE}/contacts/:contactId/tags/:tagId`,
        description: "Assign a tag to a contact idempotently.",
      },
      {
        method: "DELETE",
        path: `${PROJECT_BASE}/contacts/:contactId/tags/:tagId`,
        description: "Remove a tag from a contact idempotently.",
      },
    ],
  },
  {
    id: "workflow-management-api",
    title: "Workflow management",
    description:
      "Manage workflow definitions and ordered steps, inspect execution runs, and start manual or test executions.",
    notes: [
      "Triggers: form_submitted, booking_created, booking_cancelled, booking_pending, booking_confirmed, new_contact_created, tag_added, manual, and scheduled.",
      "Step types: send_email, ai_research, add_tag, remove_tag, wait, condition, webhook, and update_contact.",
      "Create a workflow with name, trigger, and optional triggerConfig. Steps use sortOrder, type, config, and an optional condition; update calls are partial.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/workflows`, description: "List workflows." },
      { method: "POST", path: `${PROJECT_BASE}/workflows`, description: "Create a workflow." },
      { method: "GET", path: `${PROJECT_BASE}/workflows/:workflowId`, description: "Get a workflow." },
      { method: "PUT", path: `${PROJECT_BASE}/workflows/:workflowId`, description: "Update a workflow." },
      { method: "DELETE", path: `${PROJECT_BASE}/workflows/:workflowId`, description: "Delete a workflow." },
      { method: "GET", path: `${PROJECT_BASE}/workflows/:workflowId/steps`, description: "List workflow steps." },
      { method: "POST", path: `${PROJECT_BASE}/workflows/:workflowId/steps`, description: "Create a workflow step." },
      { method: "PUT", path: `${PROJECT_BASE}/workflows/:workflowId/steps/:stepId`, description: "Update a workflow step." },
      { method: "DELETE", path: `${PROJECT_BASE}/workflows/:workflowId/steps/:stepId`, description: "Delete a workflow step." },
      { method: "PUT", path: `${PROJECT_BASE}/workflows/:workflowId/steps/reorder`, description: "Reorder workflow steps." },
      { method: "GET", path: `${PROJECT_BASE}/workflows/:workflowId/runs`, description: "List workflow runs with an optional limit." },
      { method: "GET", path: `${PROJECT_BASE}/workflows/:workflowId/runs/:runId`, description: "Get one run with step snapshots." },
      { method: "POST", path: `${PROJECT_BASE}/workflows/:workflowId/trigger`, description: "Start a manual workflow run." },
      { method: "POST", path: `${PROJECT_BASE}/workflows/:workflowId/test`, description: "Test a workflow against supplied context." },
    ],
  },
  {
    id: "analytics-activity-api",
    title: "Analytics and recent activity",
    description:
      "Read project-level activity and aggregated visitor, booking, and form performance.",
    notes: [
      "Analytics supports 7d, 30d, 90d, or custom date periods.",
      "Queries may filter by start, end, UTM source, medium, campaign, or resource slug and can group by source, country, resource, or campaign dimensions.",
      "Use the filters endpoint to populate valid resource and campaign filters before requesting a breakdown.",
    ],
    operations: [
      { method: "GET", path: `${PROJECT_BASE}/activity/recent`, description: "Get recent project activity." },
      { method: "GET", path: `${PROJECT_BASE}/analytics/filters`, description: "Get available analytics filter values." },
      { method: "GET", path: `${PROJECT_BASE}/analytics/overview`, description: "Get conversion and traffic overview metrics." },
      { method: "GET", path: `${PROJECT_BASE}/analytics/bookings`, description: "Get booking analytics." },
      { method: "GET", path: `${PROJECT_BASE}/analytics/forms`, description: "Get form analytics." },
    ],
  },
  {
    id: "files-calendars-api",
    title: "Files and project calendars",
    description:
      "Upload project-owned files and inspect calendars available through the project's connected Google accounts.",
    notes: [
      "Uploads use multipart/form-data and return an object key or URL for later use.",
      "Deleting an upload requires the complete object key, including nested path segments.",
      "Calendar listing is read-only; connect or disconnect Google accounts in the dashboard, then select calendars through the event type endpoints.",
    ],
    operations: [
      { method: "POST", path: `${PROJECT_BASE}/uploads`, description: "Upload a project-owned file." },
      { method: "DELETE", path: `${PROJECT_BASE}/uploads/:key`, description: "Delete a project-owned upload." },
      { method: "GET", path: `${PROJECT_BASE}/calendar/calendars`, description: "List calendars available to the project." },
    ],
  },
];
