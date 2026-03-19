import type { DrizzleD1Database } from "drizzle-orm/d1";

// ─── Plan Types ──────────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "business";

export interface PlanLimits {
  maxProjects: number;
  maxFormsPerProject: number;
  maxEventTypes: number;
  maxContactsPerProject: number;
  maxWorkflows: number;
  calendarSync: boolean;
  maxCalendarConnections: number; // -1 = unlimited
  apiAccess: boolean;
  customWidgets: boolean;
}

// ─── Worker Env ──────────────────────────────────────────────────────────────

export interface AppEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  // Auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;

  // Social login
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FB_CLIENT_ID: string;
  FB_CLIENT_SECRET: string;

  // Google Calendar OAuth (separate credentials)
  GOOGLE_CALENDAR_CLIENT_ID: string;
  GOOGLE_CALENDAR_CLIENT_SECRET: string;

  // Email
  RESEND_API_KEY: string;
  SENDER_EMAIL: string;
  COMPANY_ADDRESS: string;

  // Encryption
  ENCRYPTION_KEY: string;

  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_MONTHLY_PRICE_ID: string;
  STRIPE_PRO_ANNUAL_PRICE_ID: string;
  STRIPE_BUSINESS_MONTHLY_PRICE_ID: string;
  STRIPE_BUSINESS_ANNUAL_PRICE_ID: string;
  STRIPE_PRO_PRODUCT_ID: string;
  STRIPE_BUSINESS_PRODUCT_ID: string;

  // AI
  OPENAI_API_KEY: string;

  // Notifications
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;

  // Cron
  CRON_SECRET: string;

  // Bindings (from wrangler)
  UPLOADS: R2Bucket;
  CACHE: KVNamespace;
  WORKFLOW_QUEUE: Queue;
}

// ─── Hono App Context ───────────────────────────────────────────────────────

export interface HonoAppContext {
  Bindings: AppEnv;
  Variables: {
    user: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    };
    session: {
      id: string;
      userId: string;
      token: string;
      expiresAt: Date;
    };
    db: DrizzleD1Database<Record<string, unknown>>;
    subscription: {
      plan: Plan;
      status: string;
    };
    planLimits: PlanLimits;
    effectiveUserId: string;
  };
}
