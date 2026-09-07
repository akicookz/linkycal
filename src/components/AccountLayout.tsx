import { Outlet, Link, useLocation } from "react-router-dom";
import { ArrowLeft, User, CreditCard } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Profile", href: "/app/account", icon: User },
  { label: "Billing", href: "/app/account/billing", icon: CreditCard },
];

function AccountLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            to="/app"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <Logo size="sm" />
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 md:flex-row md:gap-8 md:px-6">
        <nav className="pt-2 md:w-48 md:shrink-0">
          <div className="flex gap-1 overflow-x-auto md:flex-col md:space-y-1 md:overflow-visible">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                to={tab.href}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-[12px] px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  location.pathname === tab.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 max-w-5xl py-2 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AccountLayout;
