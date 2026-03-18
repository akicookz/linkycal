import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subscription {
  plan: string;
  status: string;
}

interface PlanLimits {
  maxProjects: number;
  maxFormsPerProject: number;
  maxEventTypes: number;
  maxContactsPerProject: number;
  maxWorkflows: number;
  calendarSync: boolean;
  apiAccess: boolean;
  customWidgets: boolean;
}

interface BillingData {
  subscription: Subscription;
  planLimits: PlanLimits;
}

import { plans } from "@/lib/constants";

// ─── Component ────────────────────────────────────────────────────────────────

export default function Billing() {
  const [selectedInterval] = useState<"month" | "year">("month");

  const { data, isLoading } = useQuery<BillingData>({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const res = await fetch("/api/billing/subscription");
      if (!res.ok) throw new Error("Failed to fetch subscription");
      const data = await res.json();
      return data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ plan, interval }: { plan: string; interval: string }) => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      if (!res.ok) throw new Error("Failed to create checkout session");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to create portal session");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const currentPlan = data?.subscription?.plan ?? "free";
  const subscriptionStatus = data?.subscription?.status ?? "active";

  function handleUpgrade(planId: string) {
    checkoutMutation.mutate({ plan: planId, interval: selectedInterval });
  }

  function getPlanAction(planId: string) {
    if (planId === currentPlan) return "current";
    const planOrder = ["free", "pro", "business"];
    const currentIndex = planOrder.indexOf(currentPlan);
    const targetIndex = planOrder.indexOf(planId);
    if (targetIndex > currentIndex) return "upgrade";
    return "downgrade";
  }

  return (
    <div>
      <PageHeader title="Billing" description="Manage your subscription and billing">
        {currentPlan !== "free" && (
          <Button
            variant="outline"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
          >
            {portalMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-1.5" />
            )}
            Manage Billing
          </Button>
        )}
      </PageHeader>

      {/* Current plan card */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-[12px] bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    {isLoading ? "Loading..." : `${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan`}
                  </h3>
                  <Badge variant={subscriptionStatus === "active" ? "success" : "warning"}>
                    {subscriptionStatus}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {currentPlan === "free"
                    ? "You're on the free plan. Upgrade to unlock more features."
                    : "Your subscription is active and renews automatically."}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const action = getPlanAction(plan.id);
          const isCurrent = action === "current";

          return (
            <Card
              key={plan.id}
              className={cn(
                "relative overflow-hidden transition-shadow",
                isCurrent && "ring-2 ring-primary",
                plan.popular && !isCurrent && "ring-1 ring-primary/30",
              )}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-[12px]">
                  Popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  {plan.price === 0 ? (
                    <div className="text-3xl font-bold text-foreground">Free</div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                      <span className="text-sm text-muted-foreground">/{plan.interval}</span>
                    </div>
                  )}
                </div>

                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                  {plan.limits.map((limit) => (
                    <li key={limit} className="flex items-start gap-2.5 text-sm">
                      <span className="h-4 w-4 flex items-center justify-center text-muted-foreground mt-0.5 shrink-0">
                        &mdash;
                      </span>
                      <span className="text-muted-foreground">{limit}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isCurrent ? "outline" : "default"}
                  className="w-full"
                  disabled={isCurrent || checkoutMutation.isPending}
                  onClick={() => {
                    if (action === "upgrade" || action === "downgrade") {
                      handleUpgrade(plan.id);
                    }
                  }}
                >
                  {checkoutMutation.isPending && checkoutMutation.variables?.plan === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : null}
                  {isCurrent
                    ? "Current Plan"
                    : action === "upgrade"
                      ? `Upgrade to ${plan.name}`
                      : `Switch to ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
