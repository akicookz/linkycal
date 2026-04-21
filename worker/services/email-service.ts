// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
}

interface ResolvedPalette {
  primary: string;
  primaryText: string;
  primaryTint: string;
  background: string;
  text: string;
  muted: string;
  radius: number;
  fontFamily: string;
}

interface BookingConfirmationParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location?: string;
  notes?: string;
  meetingUrl?: string;
  theme?: EmailTheme;
}

interface BookingCancellationParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  reason?: string;
  theme?: EmailTheme;
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
  theme?: EmailTheme;
}

interface BookingRequestReceivedParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  theme?: EmailTheme;
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
  theme?: EmailTheme;
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
  theme?: EmailTheme;
}

interface FormResponseNotificationParams {
  to: string;
  ownerName: string;
  formName: string;
  respondentEmail: string | null;
  fields: Array<{ label: string; value: string }>;
  theme?: EmailTheme;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "LinkyCal <noreply@updates.linkycal.com>";

const DEFAULT_PRIMARY = "#1B4332";
const DEFAULT_PRIMARY_TEXT = "#ffffff";
const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_TEXT = "#374151";
const DEFAULT_MUTED = "#6b7280";
const DEFAULT_RADIUS = 12;
const DEFAULT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ─── Email Template Helpers ──────────────────────────────────────────────────

function resolveTheme(theme?: EmailTheme): ResolvedPalette {
  const primary = isHex(theme?.primaryBg) ? theme!.primaryBg! : DEFAULT_PRIMARY;
  const fontFamily = theme?.fontFamily
    ? `'${theme.fontFamily}', ${DEFAULT_FONT_STACK}`
    : DEFAULT_FONT_STACK;
  return {
    primary,
    primaryText: isHex(theme?.primaryText)
      ? theme!.primaryText!
      : DEFAULT_PRIMARY_TEXT,
    primaryTint: lighten(primary, 0.88),
    background: isHex(theme?.backgroundColor)
      ? theme!.backgroundColor!
      : DEFAULT_BACKGROUND,
    text: isHex(theme?.textColor) ? theme!.textColor! : DEFAULT_TEXT,
    muted: DEFAULT_MUTED,
    radius:
      typeof theme?.borderRadius === "number" && theme.borderRadius >= 0
        ? Math.min(theme.borderRadius, 32)
        : DEFAULT_RADIUS,
    fontFamily,
  };
}

function emailWrapper(content: string, p: ResolvedPalette): string {
  return `
    <div style="font-family: ${p.fontFamily}; background: ${p.background}; max-width: 560px; margin: 0 auto; padding: 48px 24px;">
      ${content}
      <p style="color: #c0c5cc; font-size: 11px; margin-top: 48px; padding-top: 20px;">
        Sent by <span style="color: ${p.primary}; font-weight: 500;">LinkyCal</span>
      </p>
    </div>`;
}

function emailHeading(text: string, p: ResolvedPalette, color?: string): string {
  return `<h2 style="color: ${color ?? p.primary}; font-size: 20px; font-weight: 600; margin: 0 0 16px 0; line-height: 1.3;">${text}</h2>`;
}

function emailBody(text: string, p: ResolvedPalette): string {
  return `<p style="color: ${p.text}; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0;">${text}</p>`;
}

function emailInfoTable(
  rows: Array<{ label: string; value: string; bold?: boolean }>,
  p: ResolvedPalette,
): string {
  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td style="padding: 10px 16px; color: ${p.primary}; font-size: 13px; font-weight: 500; width: 90px; vertical-align: top;">${r.label}</td>
      <td style="padding: 10px 16px; font-size: 14px; color: #1f2937;${r.bold ? " font-weight: 600;" : ""}">${r.value}</td>
    </tr>`,
    )
    .join("");

  return `
    <div style="background: ${p.primaryTint}; border-radius: ${p.radius}px; overflow: hidden; margin-bottom: 28px;">
      <table style="width: 100%; border-collapse: collapse;">
        ${rowsHtml}
      </table>
    </div>`;
}

function emailNote(text: string, p: ResolvedPalette): string {
  return `<p style="color: ${p.muted}; font-size: 13px; line-height: 1.5; margin: 0;">${text}</p>`;
}

function emailButton(text: string, url: string, p: ResolvedPalette): string {
  const btnRadius = Math.max(0, p.radius - 2);
  return `
    <div style="margin: 28px 0;">
      <a href="${escapeHtml(url)}" style="display: inline-block; background: ${p.primary}; color: ${p.primaryText}; padding: 12px 28px; border-radius: ${btnRadius}px; text-decoration: none; font-size: 14px; font-weight: 500;">
        ${text}
      </a>
    </div>`;
}

function bookingSubmittedFieldsSection(
  submittedFields: Array<{ label: string; value: string }> | undefined,
  p: ResolvedPalette,
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

  return emailHeading("Submitted Details", p, "#374151") + emailInfoTable(rows, p);
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
      meetingUrl,
      theme,
    } = params;

    const p = resolveTheme(theme);
    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const rows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Event", value: escapeHtml(eventTypeName), bold: true },
      { label: "Date", value: dateStr },
      { label: "Time", value: timeStr },
    ];
    if (location) rows.push({ label: "Location", value: escapeHtml(location) });
    if (meetingUrl) {
      rows.push({
        label: "Join",
        value: `<a href="${escapeHtml(meetingUrl)}" style="color: ${p.primary}; text-decoration: underline; font-weight: 500;">Join meeting</a>`,
      });
    }
    if (notes) rows.push({ label: "Notes", value: escapeHtml(notes) });

    const html = emailWrapper(
      emailHeading("Booking Confirmed", p) +
        emailBody(
          `Hi ${escapeHtml(guestName)}, your booking has been confirmed.`,
          p,
        ) +
        emailInfoTable(rows, p),
      p,
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
    const { to, guestName, eventTypeName, startTime, endTime, reason, theme } =
      params;

    const p = resolveTheme(theme);
    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = emailWrapper(
      emailHeading("Booking Cancelled", p, "#dc2626") +
        emailBody(
          `Hi ${escapeHtml(guestName)}, your booking for <strong>${escapeHtml(eventTypeName)}</strong> has been cancelled.`,
          p,
        ) +
        emailInfoTable(
          [
            { label: "Date", value: dateStr },
            { label: "Time", value: timeStr },
          ],
          p,
        ) +
        (reason
          ? emailNote(`<strong>Reason:</strong> ${escapeHtml(reason)}`, p)
          : ""),
      p,
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
      theme,
    } = params;

    const p = resolveTheme(theme);
    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = emailWrapper(
      emailHeading("New Booking", p) +
        emailBody(`Hi ${escapeHtml(ownerName)}, you have a new booking.`, p) +
        emailInfoTable(
          [
            { label: "Event", value: escapeHtml(eventTypeName), bold: true },
            {
              label: "Guest",
              value: `${escapeHtml(guestName)} (${escapeHtml(guestEmail)})`,
            },
            { label: "Date", value: dateStr },
            { label: "Time", value: timeStr },
          ],
          p,
        ) +
        bookingSubmittedFieldsSection(submittedFields, p),
      p,
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
    const { to, guestName, eventTypeName, startTime, endTime, timezone, theme } =
      params;

    const p = resolveTheme(theme);
    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const html = emailWrapper(
      emailHeading("Booking Request Submitted", p) +
        emailBody(
          `Hi ${escapeHtml(guestName)}, your booking request is sent and awaiting confirmation from the host.`,
          p,
        ) +
        emailInfoTable(
          [
            { label: "Event", value: escapeHtml(eventTypeName), bold: true },
            { label: "Date", value: dateStr },
            { label: "Time", value: timeStr },
          ],
          p,
        ) +
        emailNote(
          "You'll receive another email once your booking is confirmed.",
          p,
        ),
      p,
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
      theme,
    } = params;

    const p = resolveTheme(theme);
    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = emailWrapper(
      emailHeading("Action Needed: New Booking Request", p) +
        emailBody(
          `Hi ${escapeHtml(ownerName)}, you have a new booking request that needs your approval.`,
          p,
        ) +
        emailInfoTable(
          [
            { label: "Event", value: escapeHtml(eventTypeName), bold: true },
            {
              label: "Guest",
              value: `${escapeHtml(guestName)} (${escapeHtml(guestEmail)})`,
            },
            { label: "Date", value: dateStr },
            { label: "Time", value: timeStr },
          ],
          p,
        ) +
        bookingSubmittedFieldsSection(submittedFields, p) +
        emailButton("Review in Dashboard", dashboardUrl, p),
      p,
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
      theme,
    } = params;

    const p = resolveTheme(theme);
    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const html = emailWrapper(
      emailHeading("Booking Not Confirmed", p, "#6b7280") +
        emailBody(
          `Hi ${escapeHtml(guestName)}, unfortunately, <strong>${escapeHtml(hostName)}</strong> cannot take this call at the time you requested.`,
          p,
        ) +
        emailInfoTable(
          [
            { label: "Event", value: eventTypeName },
            { label: "Date", value: dateStr },
            { label: "Time", value: timeStr },
          ],
          p,
        ) +
        (reason
          ? emailNote(
              `<strong>Message from host:</strong> ${escapeHtml(reason)}`,
              p,
            )
          : "") +
        emailNote("You're welcome to book another time that works for you.", p),
      p,
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
    const { to, ownerName, formName, respondentEmail, fields, theme } = params;

    const p = resolveTheme(theme);
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
      emailHeading("New Form Response", p) +
        emailBody(
          `Hi ${escapeHtml(ownerName)}, someone submitted a response to <strong>${escapeHtml(formName)}</strong>.`,
          p,
        ) +
        (infoRows.length > 0 ? emailInfoTable(infoRows, p) : "") +
        emailNote("View full details in your dashboard.", p),
      p,
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

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(date);
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(date);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isHex(value: string | undefined): value is string {
  return typeof value === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function lighten(hex: string, amount: number): string {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}
