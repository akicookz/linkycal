export type WorkflowTriggerType =
  | "form_submitted"
  | "booking_created"
  | "booking_cancelled"
  | "booking_pending"
  | "booking_confirmed"
  | "tag_added"
  | "manual";

export type WorkflowStepType =
  | "send_email"
  | "ai_research"
  | "add_tag"
  | "remove_tag"
  | "wait"
  | "condition"
  | "webhook"
  | "update_contact";

export interface WorkflowTemplateStep {
  type: WorkflowStepType;
  config?: Record<string, unknown>;
}

export interface WorkflowTemplateDefinition {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTriggerType;
  steps: WorkflowTemplateStep[];
}

export const workflowTemplates: WorkflowTemplateDefinition[] = [
  {
    id: "form-lead-research",
    name: "Form Lead Research",
    description: "Research a new lead after a form submission, save the summary, and notify the team.",
    trigger: "form_submitted",
    steps: [
      {
        type: "ai_research",
        config: {
          provider: "chatgpt",
          resultKey: "lead_research",
          prompt:
            "Research this person and their company using public sources. Summarize what the company does, what role this person likely has, and any signals that would help prioritize follow-up.",
        },
      },
      {
        type: "update_contact",
        config: {
          field: "notes",
          value: "{{research.summary}}",
        },
      },
      {
        type: "send_email",
        config: {
          toList: ["team@example.com"],
          subject: "Lead research ready for {{contact.name}}",
          body:
            "<p><strong>Summary</strong></p><p>{{research.summary}}</p><p><strong>Company</strong>: {{research.company}}</p><p><strong>Role</strong>: {{research.role}}</p><p><strong>Website</strong>: {{research.website}}</p>",
        },
      },
    ],
  },
  {
    id: "booking-request-triage",
    name: "Booking Request Triage",
    description: "Research pending booking requests and send a short briefing to operations.",
    trigger: "booking_pending",
    steps: [
      {
        type: "ai_research",
        config: {
          provider: "chatgpt",
          resultKey: "booking_triage",
          prompt:
            "Research this contact before the booking is approved. Focus on company, likely role, and anything relevant for triaging or prioritizing the meeting.",
        },
      },
      {
        type: "send_email",
        config: {
          toList: ["ops@example.com"],
          subject: "Booking request triage for {{contact.name}}",
          body:
            "<p><strong>Summary</strong></p><p>{{research.summary}}</p><p><strong>Company</strong>: {{research.company}}</p><p><strong>Role</strong>: {{research.role}}</p>",
        },
      },
    ],
  },
  {
    id: "manual-contact-research",
    name: "Manual Contact Research",
    description: "Run research on a selected contact, store the findings, and notify the team.",
    trigger: "manual",
    steps: [
      {
        type: "ai_research",
        config: {
          provider: "chatgpt",
          resultKey: "contact_research",
          prompt:
            "Research this contact using public sources. Summarize who they are, where they work, what their company does, and the best next-step context for outreach.",
        },
      },
      {
        type: "update_contact",
        config: {
          field: "notes",
          value: "{{research.summary}}",
        },
      },
      {
        type: "send_email",
        config: {
          toList: ["team@example.com"],
          subject: "Manual research complete for {{contact.name}}",
          body:
            "<p><strong>Summary</strong></p><p>{{research.summary}}</p><p><strong>LinkedIn</strong>: {{research.linkedinUrl}}</p>",
        },
      },
    ],
  },
  {
    id: "cancellation-recovery",
    name: "Cancellation Recovery",
    description: "Alert the team to a cancellation, then follow up with the contact a bit later.",
    trigger: "booking_cancelled",
    steps: [
      {
        type: "send_email",
        config: {
          toList: ["team@example.com"],
          subject: "Booking cancelled by {{contact.name}}",
          body:
            "<p>{{contact.name}} ({{contact.email}}) cancelled a booking.</p><p>Review the contact and decide whether to reach out.</p>",
        },
      },
      {
        type: "wait",
        config: {
          duration: 2,
          unit: "days",
        },
      },
      {
        type: "send_email",
        config: {
          toList: ["{{contact.email}}"],
          subject: "Would you like to reschedule?",
          body:
            "<p>Hi {{contact.name}},</p><p>If you still need time, reply to this email and we can help you find a new slot.</p>",
        },
      },
    ],
  },
];
