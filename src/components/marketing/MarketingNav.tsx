import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

interface MarketingNavProps {
  onGetStarted: () => void;
}

const navLinks = [
  { label: "Features", to: "/#features" },
  { label: "How it works", to: "/#how-it-works" },
  { label: "Pricing", to: "/#pricing" },
  { label: "FAQ", to: "/#faq" },
  { label: "Docs", to: "/docs" },
];

export function MarketingNav({ onGetStarted }: MarketingNavProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 16);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/75 backdrop-blur-xl shadow-[0_1px_0_rgba(15,26,20,0.06)]"
          : "bg-transparent",
      )}
    >
      <nav className="relative max-w-7xl mx-auto px-6 h-[4.5rem] flex items-center justify-between">
        <Link to="/" className="shrink-0">
          <Logo size="md" />
        </Link>

        {/* Centered links */}
        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="px-4 py-2 text-[15px] font-medium text-foreground/70 hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onGetStarted}
          className="marketing-pill-dark h-10 px-5 gap-2 text-sm font-medium whitespace-nowrap"
        >
          Get Started
          <ArrowRight className="w-4 h-4" />
        </button>
      </nav>
    </header>
  );
}
