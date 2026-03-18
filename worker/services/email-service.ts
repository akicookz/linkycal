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
}

interface BookingRequestReceivedParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
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
}

interface BookingDeclinedParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "LinkyCal <notifications@linkycal.com>";

// ─── Service ──────────────────────────────────────────────────────────────────

export class EmailService {
  constructor(private resendApiKey: string) {}

  // ─── Send Booking Confirmation ────────────────────────────────────────────

  async sendBookingConfirmation(params: BookingConfirmationParams): Promise<void> {
    const { to, guestName, eventTypeName, startTime, endTime, timezone, location, notes } = params;

    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    let locationHtml = "";
    if (location) {
      locationHtml = `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Location</td>
          <td style="padding: 8px 0; font-size: 14px;">${escapeHtml(location)}</td>
        </tr>`;
    }

    let notesHtml = "";
    if (notes) {
      notesHtml = `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Notes</td>
          <td style="padding: 8px 0; font-size: 14px;">${escapeHtml(notes)}</td>
        </tr>`;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1B4332; margin-bottom: 8px;">Booking Confirmed</h2>
        <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">
          Hi ${escapeHtml(guestName)}, your booking has been confirmed.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 12px; padding: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Event</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${escapeHtml(eventTypeName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date</td>
            <td style="padding: 8px 0; font-size: 14px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timeStr}</td>
          </tr>${locationHtml}${notesHtml}
        </table>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Sent by LinkyCal
        </p>
      </div>`;

    await this.send({
      to,
      subject: `Booking Confirmed: ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Cancellation ────────────────────────────────────────────

  async sendBookingCancellation(params: BookingCancellationParams): Promise<void> {
    const { to, guestName, eventTypeName, startTime, endTime, reason } = params;

    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    let reasonHtml = "";
    if (reason) {
      reasonHtml = `
        <p style="color: #374151; font-size: 15px;">
          <strong>Reason:</strong> ${escapeHtml(reason)}
        </p>`;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #dc2626; margin-bottom: 8px;">Booking Cancelled</h2>
        <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">
          Hi ${escapeHtml(guestName)}, your booking for <strong>${escapeHtml(eventTypeName)}</strong> has been cancelled.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 12px; padding: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Date</td>
            <td style="padding: 8px 0; font-size: 14px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timeStr}</td>
          </tr>
        </table>
        ${reasonHtml}
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Sent by LinkyCal
        </p>
      </div>`;

    await this.send({
      to,
      subject: `Booking Cancelled: ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Notification (to Owner) ─────────────────────────────────

  async sendBookingNotification(params: BookingNotificationParams): Promise<void> {
    const { to, ownerName, guestName, guestEmail, eventTypeName, startTime, endTime } = params;

    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1B4332; margin-bottom: 8px;">New Booking</h2>
        <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">
          Hi ${escapeHtml(ownerName)}, you have a new booking.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 12px; padding: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Event</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${escapeHtml(eventTypeName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Guest</td>
            <td style="padding: 8px 0; font-size: 14px;">${escapeHtml(guestName)} (${escapeHtml(guestEmail)})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date</td>
            <td style="padding: 8px 0; font-size: 14px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timeStr}</td>
          </tr>
        </table>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Sent by LinkyCal
        </p>
      </div>`;

    await this.send({
      to,
      subject: `New Booking: ${guestName} - ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Request Received (to Guest) ──────────────────────────────

  async sendBookingRequestReceived(params: BookingRequestReceivedParams): Promise<void> {
    const { to, guestName, eventTypeName, startTime, endTime, timezone } = params;

    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #b45309; margin-bottom: 8px;">Booking Request Submitted</h2>
        <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">
          Hi ${escapeHtml(guestName)}, your booking request has been submitted and is awaiting confirmation from the host.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 12px; padding: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Event</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${escapeHtml(eventTypeName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date</td>
            <td style="padding: 8px 0; font-size: 14px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timeStr}</td>
          </tr>
        </table>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
          You'll receive another email once your booking is confirmed.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Sent by LinkyCal
        </p>
      </div>`;

    await this.send({
      to,
      subject: `Booking Request: ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Request Notification (to Owner) ─────────────────────────

  async sendBookingRequestNotification(params: BookingRequestNotificationParams): Promise<void> {
    const { to, ownerName, guestName, guestEmail, eventTypeName, startTime, endTime, dashboardUrl } = params;

    const dateStr = formatDate(startTime, "UTC");
    const timeStr = `${formatTime(startTime, "UTC")} - ${formatTime(endTime, "UTC")} UTC`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #b45309; margin-bottom: 8px;">Action Needed: New Booking Request</h2>
        <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">
          Hi ${escapeHtml(ownerName)}, you have a new booking request that needs your approval.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 12px; padding: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Event</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${escapeHtml(eventTypeName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Guest</td>
            <td style="padding: 8px 0; font-size: 14px;">${escapeHtml(guestName)} (${escapeHtml(guestEmail)})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date</td>
            <td style="padding: 8px 0; font-size: 14px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timeStr}</td>
          </tr>
        </table>
        <div style="margin-top: 24px;">
          <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; background: #1B4332; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Review in Dashboard
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Sent by LinkyCal
        </p>
      </div>`;

    await this.send({
      to,
      subject: `Action Needed: ${guestName} - ${eventTypeName}`,
      html,
    });
  }

  // ─── Send Booking Declined (to Guest) ─────────────────────────────────────

  async sendBookingDeclined(params: BookingDeclinedParams): Promise<void> {
    const { to, guestName, eventTypeName, startTime, endTime, timezone } = params;

    const dateStr = formatDate(startTime, timezone);
    const timeStr = `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #6b7280; margin-bottom: 8px;">Booking Not Confirmed</h2>
        <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">
          Hi ${escapeHtml(guestName)}, unfortunately your booking request for <strong>${escapeHtml(eventTypeName)}</strong> was not confirmed.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 12px; padding: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Date</td>
            <td style="padding: 8px 0; font-size: 14px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timeStr}</td>
          </tr>
        </table>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
          You're welcome to book another time that works for you.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Sent by LinkyCal
        </p>
      </div>`;

    await this.send({
      to,
      subject: `Booking Update: ${eventTypeName}`,
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
