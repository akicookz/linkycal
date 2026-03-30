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

// ─── Customer Recovery ───────────────────────────────────────────────────────

export function selectRecoveredCustomer(
  customers: Stripe.Customer[],
  userId: string,
  email?: string | null,
): Stripe.Customer | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const metadataMatch = customers.find((customer) => customer.metadata?.userId === userId);
  if (metadataMatch) {
    return metadataMatch;
  }

  if (!normalizedEmail) {
    return null;
  }

  const emailMatches = customers.filter((customer) => {
    return customer.email?.trim().toLowerCase() === normalizedEmail;
  });

  return emailMatches.length === 1 ? emailMatches[0] : null;
}

export async function findExistingCustomerForUser(
  stripe: Stripe,
  userId: string,
  email?: string | null,
): Promise<Stripe.Customer | null> {
  try {
    const search = await stripe.customers.search({
      query: `metadata['userId']:'${escapeStripeSearchValue(userId)}'`,
      limit: 10,
    });
    const metadataMatch = selectRecoveredCustomer(search.data, userId, email);
    if (metadataMatch) {
      return metadataMatch;
    }
  } catch (error) {
    console.warn("Stripe customer metadata search failed, falling back to email lookup", error);
  }

  if (!email) {
    return null;
  }

  const emailMatches = await stripe.customers.list({
    email,
    limit: 10,
  });
  return selectRecoveredCustomer(emailMatches.data, userId, email);
}

function escapeStripeSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
