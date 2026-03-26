import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PricingCardsProps {
  onGetStarted?: () => void;
}

const plans = [
  {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "For personal projects and trying things out.",
    features: [
      "1 project",
      "3 forms",
      "3 event types",
      "100 contacts",
      "1 workflow",
      "Community support",
    ],
    cta: "Get Started Free",
    highlighted: false,
  },
  {
    name: "Pro",
    monthlyPrice: 29,
    annualPrice: 24,
    description: "For growing teams that need more power.",
    badge: "Most Popular",
    features: [
      "5 projects",
      "20 forms per project",
      "20 event types",
      "5,000 contacts per project",
      "10 workflows",
      "Google Calendar sync",
      "API access",
      "Priority support",
    ],
    cta: "Start 7-Day Free Trial",
    highlighted: true,
  },
  {
    name: "Business",
    monthlyPrice: 99,
    annualPrice: 82,
    description: "For teams that need everything, unlimited.",
    features: [
      "20 projects",
      "Unlimited forms",
      "Unlimited event types",
      "Unlimited contacts",
      "Unlimited workflows",
      "Google Calendar sync",
      "API access",
      "Custom embeddable widgets",
      "Dedicated support",
    ],
    cta: "Start 7-Day Free Trial",
    highlighted: false,
  },
];

function PricingCards({ onGetStarted }: PricingCardsProps) {
  const [annual, setAnnual] = useState(false);

  return (
    <div>
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <div className="inline-flex items-center rounded-full border border-border/70 bg-white/45 p-1 backdrop-blur-xl">
          <button
            onClick={() => setAnnual(false)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
              !annual
                ? "glow-surface text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={cn(
              "pl-4 pr-1 py-1.5 rounded-full text-sm font-medium transition-all",
              annual
                ? "glow-surface text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Annual
            <span className={cn("ml-2 text-xs font-medium text-brand-soft bg-brand/5 border border-brand/10 px-2.5 py-1 rounded-full", annual && "text-white bg-white/20 border-white/20")}>
              2 months free
            </span>
          </button>
        </div>
      </div>
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => {
          const price = annual ? plan.annualPrice : plan.monthlyPrice;
          return (
            <div
              key={plan.name}
              className={cn(
                "card-glow-secondary p-7 flex flex-col",
                plan.highlighted && "card-glow-primary ring-2 ring-brand/15",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {plan.name}
                </h3>
                {plan.badge && (
                  <span className="text-[11px] font-semibold text-brand bg-brand/8 border border-brand/10 px-2 py-0.5 rounded-full">
                    {plan.badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {plan.description}
              </p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground tracking-tight">
                  ${price}
                </span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="w-4 h-4 text-brand-soft shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                onClick={onGetStarted}
              >
                {plan.cta}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { PricingCards };
