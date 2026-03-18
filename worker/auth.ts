import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import {
  withCloudflare,
  type CloudflareGeolocation,
} from "better-auth-cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "./db/auth.schema";
import type { AppEnv } from "./types";

// ─── Auth Factory ────────────────────────────────────────────────────────────

export function createAuth(
  env: AppEnv,
  cf?: CfProperties,
) {
  const db = drizzle(env.DB, { schema: authSchema });

  return betterAuth({
    ...withCloudflare(
      {
        autoDetectIpAddress: true,
        geolocationTracking: true,
        cf: (cf as CloudflareGeolocation) || ({} as CloudflareGeolocation),
        d1: {
          db: db as any,
          options: {
            usePlural: true,
            debugLogs: false,
          },
        },
      },
      {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
          facebook: {
            clientId: env.FB_CLIENT_ID,
            clientSecret: env.FB_CLIENT_SECRET,
          },
        },
        rateLimit: {
          enabled: true,
          window: 60,
          max: 200,
        },
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
      },
    ),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        async sendVerificationOTP({ email, otp, type }) {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "LinkyCal <noreply@updates.linkycal.com>",
              to: [email],
              subject:
                type === "sign-in"
                  ? `${otp} is your LinkyCal sign-in code`
                  : type === "forget-password"
                    ? `${otp} is your password reset code`
                    : `${otp} is your verification code`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
                  <h2 style="color: #1B4332; margin-bottom: 8px;">Your verification code</h2>
                  <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">
                    Enter this code to ${type === "sign-in" ? "sign in to" : type === "forget-password" ? "reset your password on" : "verify your email on"} LinkyCal.
                  </p>
                  <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1B4332; background: #f1f5f9; border-radius: 12px; padding: 16px; text-align: center;">
                    ${otp}
                  </div>
                  <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
                    This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.
                  </p>
                </div>
              `,
            }),
          });

          if (!res.ok) {
            const body = await res.text();
            console.error("[OTP Email] Failed to send:", res.status, body);
            throw new Error(`Failed to send OTP email: ${res.status}`);
          }
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
