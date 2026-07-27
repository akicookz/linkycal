import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import { EmailService } from "../services/email-service";
import { parseProjectTheme } from "./booking-actions";
import { resolveProjectEntitlements } from "./entitlements";

export function uploadedFileDisplayValue(
  value: string | null,
  fileUrl: string | null,
): string {
  if (value?.trim()) return value.trim();
  if (fileUrl?.startsWith("form-responses/")) return "Uploaded file";
  return fileUrl?.trim() ?? "";
}

function getFormResponseNotificationEmail(settings: unknown): string | null {
  let settingsRecord: Record<string, unknown> = {};
  if (settings && typeof settings === "object") {
    settingsRecord = settings as Record<string, unknown>;
  } else if (typeof settings === "string") {
    try {
      const parsed = JSON.parse(settings);
      if (parsed && typeof parsed === "object") {
        settingsRecord = parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  const rawEmail = settingsRecord.responseNotificationEmail;
  if (typeof rawEmail !== "string") return null;
  const email = rawEmail.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function notifyFormResponseCompleted(
  db: DrizzleD1Database<Record<string, unknown>>,
  env: { RESEND_API_KEY: string },
  responseId: string,
  formId: string,
): Promise<void> {
  try {
    const [form] = await db
      .select({
        id: dbSchema.forms.id,
        name: dbSchema.forms.name,
        projectId: dbSchema.forms.projectId,
        settings: dbSchema.forms.settings,
      })
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.id, formId))
      .limit(1);
    if (!form) return;

    const [project] = await db
      .select({
        id: dbSchema.projects.id,
        userId: dbSchema.projects.userId,
        settings: dbSchema.projects.settings,
      })
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, form.projectId))
      .limit(1);
    if (!project) return;

    const entitlements = await resolveProjectEntitlements(db, project.id);
    if (!entitlements || entitlements.subscription.plan === "free") return;

    const [owner] = await db
      .select({
        name: dbSchema.schema.users.name,
        email: dbSchema.schema.users.email,
      })
      .from(dbSchema.schema.users)
      .where(eq(dbSchema.schema.users.id, project.userId))
      .limit(1);
    if (!owner?.email) return;

    const [formResponse] = await db
      .select({ respondentEmail: dbSchema.formResponses.respondentEmail })
      .from(dbSchema.formResponses)
      .where(eq(dbSchema.formResponses.id, responseId))
      .limit(1);
    const fieldValues = await db
      .select({
        label: dbSchema.formFields.label,
        type: dbSchema.formFields.type,
        value: dbSchema.formFieldValues.value,
        fileUrl: dbSchema.formFieldValues.fileUrl,
      })
      .from(dbSchema.formFieldValues)
      .innerJoin(
        dbSchema.formFields,
        and(
          eq(dbSchema.formFieldValues.formId, dbSchema.formFields.formId),
          eq(dbSchema.formFieldValues.fieldId, dbSchema.formFields.id),
        ),
      )
      .where(eq(dbSchema.formFieldValues.responseId, responseId));

    const notificationEmail =
      getFormResponseNotificationEmail(form.settings) ?? owner.email;
    const emailService = new EmailService(env.RESEND_API_KEY);
    await emailService.sendFormResponseNotification({
      to: notificationEmail,
      ownerName: owner.name ?? "there",
      formName: form.name,
      respondentEmail: formResponse?.respondentEmail ?? null,
      fields: fieldValues.map(function toNotificationField(field) {
        return {
          label: field.label,
          value:
            field.type === "file"
              ? uploadedFileDisplayValue(field.value, field.fileUrl)
              : (field.value ?? ""),
        };
      }),
      theme: parseProjectTheme(project.settings),
    });
  } catch (error) {
    console.error("Form response notification email failed:", error);
  }
}
