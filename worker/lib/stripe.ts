import Stripe from "stripe";
import type { AppEnv, Plan } from "../types";

// ─── Stripe Instance ─────────────────────────────────────────────────────────

export function getStripe(env: AppEnv): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-02-25.clover",
  });
}

// ─── Price ID Mapping ────────────────────────────────────────────────────────

type PaidPlan = Exclude<Plan, "free">;
type Interval = "month" | "year";

const PRICE_ID_ENV_KEYS: Record<PaidPlan, Record<Interval, keyof AppEnv>> = {
  pro: {
    month: "STRIPE_PRO_MONTHLY_PRICE_ID",
    year: "STRIPE_PRO_ANNUAL_PRICE_ID",
  },
  business: {
    month: "STRIPE_BUSINESS_MONTHLY_PRICE_ID",
    year: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
  },
};

export function getPriceId(
  env: AppEnv,
  plan: PaidPlan,
  interval: Interval,
): string {
  const key = PRICE_ID_ENV_KEYS[plan]?.[interval];
  if (!key) {
    throw new Error(`No price ID configured for ${plan}/${interval}`);
  }
  const priceId = env[key] as string;
  if (!priceId) {
    throw new Error(`Price ID env var ${key} is not set`);
  }
  return priceId;
}

export function getPlanFromPriceId(
  env: AppEnv,
  priceId: string,
): { plan: PaidPlan; interval: Interval } | null {
  for (const [plan, intervals] of Object.entries(PRICE_ID_ENV_KEYS)) {
    for (const [interval, envKey] of Object.entries(intervals)) {
      if (env[envKey as keyof AppEnv] === priceId) {
        return { plan: plan as PaidPlan, interval: interval as Interval };
      }
    }
  }
  return null;
}
