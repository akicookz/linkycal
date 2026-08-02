import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PlanComparison, formatPlanValue } from "@/components/PlanComparison";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { cn } from "@/lib/utils";
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  type EntitlementKey,
} from "../../shared/plan-catalog";

const CARD_KEYS: EntitlementKey[] = [
  "projects",
  "forms",
  "contacts",
  "formResponses",
  "bookings",
  "apiAccess",
  "mcpAccess",
  "customCss",
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);
  const navigate = useNavigate();

  function getStarted() {
    navigate("/app/onboarding");
  }

  return (
    <div className="min-h-screen bg-[#F7FAF8]">
      <SEOHead
        title="Pricing"
        description="Compare LinkyCal Free, Pro, and Business plans with exact project, response, contact, automation, API, MCP, and Custom CSS limits."
        canonical="/pricing"
      />
      <MarketingNav onGetStarted={getStarted} />

      <main className="px-5 pb-24 pt-32 sm:px-6 sm:pt-40">
        <section className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-brand/8 px-3 py-1.5 text-sm font-medium text-brand">
            <Sparkles className="size-4" />
            Plans for every stage
          </div>
          <h1 className="font-heading text-4xl font-bold tracking-[-0.035em] text-foreground sm:text-6xl">
            Simple pricing, clear limits
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Bookings, REST API, MCP, widgets, and theme overrides are included
            on every plan. Upgrade when you need more capacity or Custom CSS.
          </p>

          <div className="mx-auto mt-8 inline-flex rounded-full bg-white p-1 shadow-[0_12px_35px_-25px_rgba(27,67,50,0.7)]">
            <button
              type="button"
              aria-label="Monthly billing"
              aria-pressed={!annual}
              onClick={() => setAnnual(false)}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-medium transition-[background-color,color,box-shadow]",
                !annual
                  ? "glow-surface text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-label="Annual billing"
              aria-pressed={annual}
              onClick={() => setAnnual(true)}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-medium transition-[background-color,color,box-shadow]",
                annual
                  ? "glow-surface text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Annual · save 2 months
            </button>
          </div>
        </section>

        <section className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-3">
          {PLAN_ORDER.map(function planCard(planId) {
            const plan = PLAN_CATALOG[planId];
            const price = annual
              ? plan.prices.annualMonthly
              : plan.prices.monthly;
            return (
              <article
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-[24px] bg-white p-7 shadow-[0_24px_70px_-52px_rgba(27,67,50,0.65)]",
                  plan.highlighted &&
                    "shadow-[0_28px_80px_-45px_rgba(27,67,50,0.75),inset_0_0_0_2px_rgba(27,67,50,0.13)]",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>
                  {plan.badge ? (
                    <span className="rounded-full bg-brand/8 px-2.5 py-1 text-xs font-semibold text-brand">
                      {plan.badge}
                    </span>
                  ) : null}
                </div>
                <div className="mt-7">
                  <span className="font-heading text-5xl font-bold tracking-[-0.04em] tabular-nums">
                    ${price}
                  </span>
                  <span className="text-sm text-muted-foreground"> / month</span>
                  <p className="mt-1 min-h-5 text-xs text-muted-foreground tabular-nums">
                    {annual && plan.prices.annualTotal > 0
                      ? `$${plan.prices.annualTotal} billed yearly`
                      : plan.id === "free"
                        ? "Free forever"
                        : "Billed monthly"}
                  </p>
                </div>
                <ul className="mt-7 flex-1 space-y-3">
                  {CARD_KEYS.map(function cardValue(key) {
                    const value = plan.entitlements[key];
                    if (!value.enabled) return null;
                    const label = key === "apiAccess"
                      ? "REST API included"
                      : key === "mcpAccess"
                        ? "MCP included"
                        : key === "customCss"
                          ? "Custom CSS"
                          : `${formatPlanValue(key, value)} ${cardLabel(key)}`;
                    return (
                      <li key={key} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                        {label}
                      </li>
                    );
                  })}
                </ul>
                <Button
                  variant={plan.highlighted ? "default" : "outline"}
                  className="mt-8 w-full"
                  onClick={getStarted}
                >
                  <ArrowRight className="size-4" />
                  {plan.id === "free" ? "Start free" : `Choose ${plan.name}`}
                </Button>
              </article>
            );
          })}
        </section>

        <section className="mx-auto mt-20 max-w-6xl">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand">
              Full comparison
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold tracking-[-0.025em]">
              Every feature and limit
            </h2>
          </div>
          <PlanComparison />
        </section>

        <section className="mx-auto mt-20 max-w-4xl rounded-[24px] bg-brand px-7 py-10 text-center text-white sm:px-12">
          <h2 className="font-heading text-3xl font-bold">Start with Free</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/75 sm:text-base">
            Build your first project with API and MCP access included. Upgrade
            only when your workspace needs more volume.
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={getStarted}
          >
            <ArrowRight className="size-4" />
            Create your workspace
          </Button>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

function cardLabel(key: EntitlementKey): string {
  const labels: Partial<Record<EntitlementKey, string>> = {
    projects: "projects",
    forms: "forms per project",
    contacts: "contacts per project",
    formResponses: "responses per month",
    bookings: "bookings",
  };
  return labels[key] ?? key;
}
