// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingConfirmationParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location?: string;
  notes?: string;
  submittedFields?: Array<{ label: string; value: string }>;
}

interface BookingCancellationParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  reason?: string;
}

interface BookingNotificationParams {
  to: string;
  ownerName: string;
  guestName: string;
  guestEmail: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  submittedFields?: Array<{ label: string; value: string }>;
}

interface BookingRequestReceivedParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  submittedFields?: Array<{ label: string; value: string }>;
}

interface BookingRequestNotificationParams {
  to: string;
  ownerName: string;
  guestName: string;
  guestEmail: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  dashboardUrl: string;
  submittedFields?: Array<{ label: string; value: string }>;
}

interface BookingDeclinedParams {
  to: string;
  guestName: string;
  hostName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  reason?: string;
}

interface FormResponseNotificationParams {
  to: string;
  ownerName: string;
  formName: string;
  respondentEmail: string | null;
  fields: Array<{ label: string; value: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "LinkyCal <noreply@updates.linkycal.com>";

// ─── Service ──────────────────────────────────────────────────────────────────

// ─── Email Template Helpers ──────────────────────────────────────────────────

const BRAND_COLOR = "#1B4332";
const BRAND_LIGHT = "#e8f0ec"; // light tint of brand for table bg

function emailWrapper(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 48px 24px;">
      ${content}
      <p style="color: #c0c5cc; font-size: 11px; margin-top: 48px; padding-top: 20px;">
        Sent by <span style="color: ${BRAND_COLOR}; font-weight: 500;">LinkyCal</span>
      </p>
    </div>`;
}

function emailHeading(text: string, color: string = BRAND_COLOR): string {
  return `<h2 style="color: ${color}; font-size: 20px; font-weight: 600; margin: 0 0 16px 0; line-height: 1.3;">${text}</h2>`;
}

function emailBody(text: string): string {
  return `<p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0;">${text}</p>`;
}

function emailInfoTable(
  rows: Array<{ label: string; value: string; bold?: boolean }>,
): string {
  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td style="padding: 10px 16px; color: ${BRAND_COLOR}; font-size: 13px; font-weight: 500; width: 90px; vertical-align: top;">${r.label}</td>
      <td style="padding: 10px 16px; font-size: 14px; color: #1f2937;${r.bold ? " font-weight: 600;" : ""}">${r.value}</td>
    </tr>`,
    )
    .join("");

  return `
    <div style="background: ${BRAND_LIGHT}; border-radius: 12px; overflow: hidden; margin-bottom: 28px;">
      <table style="width: 100%; border-collapse: collapse;">
        ${rowsHtml}
      </table>
    </div>`;
}

function emailNote(text: string): string {
  return `<p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0;">${text}</p>`;
}

function emailButton(text: string, url: string): string {
  return `
    <div style="margin: 28px 0;">
      <a href="${escapeHtml(url)}" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-size: 14px; font-weight: 500;">
        ${text}
      </a>
    </div>`;
}

function bookingSubmittedFieldsSection(
  submittedFields?: Array<{ label: string; value: string }>,
): string {
  const visibleFields = (submittedFields ?? []).filter((field) =>
    field.value.trim(),
  );
  if (visibleFields.length === 0) return "";

  const rows = visibleFields.slice(0, 8).map((field) => ({
    label: escapeHtml(field.label),
    value: escapeHtml(field.value),
  }));

  if (visibleFields.length > 8) {
    rows.push({
      label: "",
      value: `+ ${visibleFields.length - 8} more responses`,
    });
  }

  return emailHeading("Submitted Details", "#374151") + emailInfoTable(rows);
}

// ─── Service ────────────────────────────────────────────────────────────────

export class EmailService {
  constructor(private resendApiKey: string) {}

  // ─── Send Booking Confirmation ────────────────────────────────────────────

  async sendBookingConfirmation(
    params: BookingConfirmationParams,
  ): Promise<void> {
    const {
      to,
      guestName,
      eventTypeName,
      startTime,
      endTime,
      timezone,
      location,
      notes,
      submittedFields,
    } = params;

    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const rows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Event", value: escapeHtml(eventTypeName), bold: true },
      { label: "Date", value: dateStr },
      { label: "Time", value: timeStr },
    ];
    if (location) rows.push({ label: "Location", value: escapeHtml(location) });
    if (notes) rows.push({ label: "Notes", value: escapeHtml(notes) });

    const html = emailWrapper(
      emailHeading("Booking Confirmed") +
        emailBody(
          `Hi ${escapeHtml(guestName)}, your booking has been confirmed.`,
        ) +
        emailInfoTable(rows) +
        bookingSubmittedFieldsSection(submittedFields),
    );

    await this.send({
      to,
      subject: `Booking Confirmed: ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Cancellation ────────────────────────────────────────────

  async sendBookingCancellation(
    params: BookingCancellationParams,
  ): Promise<void> {
    const { to, guestName, eventTypeName, startTime, endTime, reason } = params;

    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = emailWrapper(
      emailHeading("Booking Cancelled", "#dc2626") +
        emailBody(
          `Hi ${escapeHtml(guestName)}, your booking for <strong>${escapeHtml(eventTypeName)}</strong> has been cancelled.`,
        ) +
        emailInfoTable([
          { label: "Date", value: dateStr },
          { label: "Time", value: timeStr },
        ]) +
        (reason
          ? emailNote(`<strong>Reason:</strong> ${escapeHtml(reason)}`)
          : ""),
    );

    await this.send({
      to,
      subject: `Booking Cancelled: ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Notification (to Owner) ─────────────────────────────────

  async sendBookingNotification(
    params: BookingNotificationParams,
  ): Promise<void> {
    const {
      to,
      ownerName,
      guestName,
      guestEmail,
      eventTypeName,
      startTime,
      endTime,
      submittedFields,
    } = params;

    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = emailWrapper(
      emailHeading("New Booking") +
        emailBody(`Hi ${escapeHtml(ownerName)}, you have a new booking.`) +
        emailInfoTable([
          { label: "Event", value: escapeHtml(eventTypeName), bold: true },
          {
            label: "Guest",
            value: `${escapeHtml(guestName)} (${escapeHtml(guestEmail)})`,
          },
          { label: "Date", value: dateStr },
          { label: "Time", value: timeStr },
        ]) +
        bookingSubmittedFieldsSection(submittedFields),
    );

    await this.send({
      to,
      subject: `New Booking: ${guestName} - ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Request Received (to Guest) ──────────────────────────────

  async sendBookingRequestReceived(
    params: BookingRequestReceivedParams,
  ): Promise<void> {
    const {
      to,
      guestName,
      eventTypeName,
      startTime,
      endTime,
      timezone,
      submittedFields,
    } = params;

    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const html = emailWrapper(
      emailHeading("Booking Request Submitted") +
        emailBody(
          `Hi ${escapeHtml(guestName)}, your booking request is sent and awaiting confirmation from the host.`,
        ) +
        emailInfoTable([
          { label: "Event", value: escapeHtml(eventTypeName), bold: true },
          { label: "Date", value: dateStr },
          { label: "Time", value: timeStr },
        ]) +
        bookingSubmittedFieldsSection(submittedFields) +
        emailNote(
          "You'll receive another email once your booking is confirmed.",
        ),
    );

    await this.send({
      to,
      subject: `Booking Request: ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Request Notification (to Owner) ─────────────────────────

  async sendBookingRequestNotification(
    params: BookingRequestNotificationParams,
  ): Promise<void> {
    const {
      to,
      ownerName,
      guestName,
      guestEmail,
      eventTypeName,
      startTime,
      endTime,
      dashboardUrl,
      submittedFields,
    } = params;

    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = emailWrapper(
      emailHeading("Action Needed: New Booking Request") +
        emailBody(
          `Hi ${escapeHtml(ownerName)}, you have a new booking request that needs your approval.`,
        ) +
        emailInfoTable([
          { label: "Event", value: escapeHtml(eventTypeName), bold: true },
          {
            label: "Guest",
            value: `${escapeHtml(guestName)} (${escapeHtml(guestEmail)})`,
          },
          { label: "Date", value: dateStr },
          { label: "Time", value: timeStr },
        ]) +
        bookingSubmittedFieldsSection(submittedFields) +
        emailButton("Review in Dashboard", dashboardUrl),
    );

    await this.send({
      to,
      subject: `Action Needed: ${guestName} - ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Declined (to Guest) ─────────────────────────────────────

  async sendBookingDeclined(params: BookingDeclinedParams): Promise<void> {
    const {
      to,
      guestName,
      hostName,
      eventTypeName,
      startTime,
      endTime,
      timezone,
      reason,
    } = params;

    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const html = emailWrapper(
      emailHeading("Booking Not Confirmed", "#6b7280") +
        emailBody(
          `Hi ${escapeHtml(guestName)}, unfortunately, <strong>${escapeHtml(hostName)}</strong> cannot take this call at the time you requested.`,
        ) +
        emailInfoTable([
          { label: "Event", value: eventTypeName },
          { label: "Date", value: dateStr },
          { label: "Time", value: timeStr },
        ]) +
        (reason
          ? emailNote(
              `<strong>Message from host:</strong> ${escapeHtml(reason)}`,
            )
          : "") +
        emailNote("You're welcome to book another time that works for you."),
    );

    await this.send({
      to,
      subject: `Booking Update: ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Form Response Notification (to Owner) ────────────────────────────

  async sendFormResponseNotification(
    params: FormResponseNotificationParams,
  ): Promise<void> {
    const { to, ownerName, formName, respondentEmail, fields } = params;

    const infoRows: Array<{ label: string; value: string; bold?: boolean }> =
      [];
    if (respondentEmail) {
      infoRows.push({
        label: "Respondent",
        value: escapeHtml(respondentEmail),
      });
    }
    for (const field of fields.slice(0, 8)) {
      infoRows.push({
        label: escapeHtml(field.label),
        value: escapeHtml(field.value || "—"),
      });
    }
    if (fields.length > 8) {
      infoRows.push({ label: "", value: `+ ${fields.length - 8} more fields` });
    }

    const html = emailWrapper(
      emailHeading("New Form Response") +
        emailBody(
          `Hi ${escapeHtml(ownerName)}, someone submitted a response to <strong>${escapeHtml(formName)}</strong>.`,
        ) +
        (infoRows.length > 0 ? emailInfoTable(infoRows) : "") +
        emailNote("View full details in your dashboard."),
    );

    await this.send({
      to,
      subject: `New Form Response: ${formName}`,
      html,
    });
  }

  // ─── Private: Send Email via Resend ───────────────────────────────────────

  private async send(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Format a Date to a human-readable date string in a timezone.
 */
function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(date);
}

/**
 * Format a Date to a human-readable time string in a timezone.
 */
function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(date);
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
