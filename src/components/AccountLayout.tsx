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
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
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
          </div>
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                to={tab.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  location.pathname === tab.href
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default AccountLayout;
