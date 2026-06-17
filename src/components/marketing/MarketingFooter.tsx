import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

const pageLinks = [
  { label: "Home", to: "/" },
  { label: "Features", to: "/#features" },
  { label: "Pricing", to: "/#pricing" },
  { label: "FAQ", to: "/#faq" },
  { label: "Documentation", to: "/docs" },
];

const featureLinks = [
  { label: "Scheduling", to: "/features/scheduling" },
  { label: "Forms", to: "/features/forms" },
  { label: "Contacts", to: "/features/contacts" },
  { label: "Workflows", to: "/features/workflows" },
  { label: "Headless & API", to: "/features/api", isNew: true },
];

const compareLinks = [
  { label: "vs Formspree", to: "/alternatives/formspree" },
  { label: "vs Typeform", to: "/alternatives/typeform" },
  { label: "vs Tally", to: "/alternatives/tally" },
  { label: "vs Calendly", to: "/alternatives/calendly" },
  { label: "vs Jotform", to: "/alternatives/jotform" },
  { label: "vs Cal.com", to: "/alternatives/cal-com" },
  { label: "vs Google Forms", to: "/alternatives/google-forms" },
];

export function MarketingFooter() {
  return (
    <footer className="relative bg-[#0C1410] text-white px-6 pt-16 pb-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-10">
          {/* Brand */}
          <div>
            <Logo size="md" variant="light" />
            <p className="text-sm text-white/55 leading-relaxed mt-5 max-w-xs">
              Form and scheduling infrastructure for modern teams. Multi-step
              forms, calendar scheduling, contact management, and embeddable
              widgets — all API-first.
            </p>
            <div className="flex items-center gap-3 mt-6">
              {/* Twitter/X */}
              <a
                href="https://twitter.com/linkycal"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkyCal on X"
                className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              {/* LinkedIn */}
              <a
                href="https://linkedin.com/company/linkycal"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkyCal on LinkedIn"
                className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {pageLinks.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="text-sm text-white/55 hover:text-white transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Features</h4>
            <ul className="space-y-2.5">
              {featureLinks.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white transition-colors"
                  >
                    {item.label}
                    {item.isNew && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand-soft text-white rounded-full px-2 py-0.5">
                        New
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Compare */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Compare</h4>
            <ul className="space-y-2.5">
              {compareLinks.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="text-sm text-white/55 hover:text-white transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Information */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">
              Information
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="mailto:hello@linkycal.com"
                  className="text-sm text-white/55 hover:text-white transition-colors"
                >
                  Contact
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  className="text-sm text-white/55 hover:text-white transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/terms"
                  className="text-sm text-white/55 hover:text-white transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-14 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-white/45">&copy; 2026 LinkyCal</p>
          <p className="text-sm text-white/45">
            A{" "}
            <a
              href="https://launchfast.pro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white transition-colors"
            >
              LaunchFast
            </a>{" "}
            product
          </p>
        </div>
      </div>
    </footer>
  );
}
