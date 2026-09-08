import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PricingSection } from "@/components/marketing/MarketingSections";
import { PlanComparison } from "@/components/PlanComparison";
import { SEOHead } from "@/components/SEOHead";

export default function Pricing() {
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
        </section>

        <PricingSection
          onGetStarted={getStarted}
          showHeading={false}
          className="mt-12 px-0 py-0"
        />

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
