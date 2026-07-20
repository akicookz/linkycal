import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { ArrowRight, Link2, Code2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SEOHead } from "@/components/SEOHead";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { signIn, emailOtp, useSession } from "@/lib/auth-client";
import { getSafeAuthRedirect, storeAuthRedirect } from "@/lib/auth-redirect";
import { usePostHog } from "@posthog/react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { CopyLlmsButton } from "@/components/marketing/CopyLlmsButton";
import {
  ToolkitSection,
  ComparisonSection,
  HowItWorksSection,
  IntegrationsSection,
  HeadlessSection,
  TestimonialSection,
  PricingSection,
  FaqSection,
  FinalCtaSection,
} from "@/components/marketing/MarketingSections";

/* ─── Landing Page ────────────────────────────────────────────────────────── */

// Compact, syntax-highlighted snippet for the narrow hero card; the developer
// section below shows the full production endpoint. Each line is a list of
// [text, token] pairs so we can colorize without pulling in a highlighter.
const SYN = {
  cm: "text-[#5f7e6d] italic",
  pu: "text-[#62917c]",
  tag: "text-[#6bc4a3]",
  attr: "text-[#dab27c]",
  str: "text-[#e89c7b]",
  txt: "text-[#cfe6da]",
} as const;

type SynToken = keyof typeof SYN;

function getAuthSearchParams(redirectTo: string): Record<string, string> {
  if (redirectTo === "/app") {
    return { show_auth: "true" };
  }

  return { show_auth: "true", redirect: redirectTo };
}

const HERO_CODE: [string, SynToken][][] = [
  [["<!-- Native HTML. No JS, no server. -->", "cm"]],
  [["<", "pu"], ["form", "tag"]],
  [
    ["  ", "txt"],
    ["action", "attr"],
    ["=", "pu"],
    ['"https://linkycal.com/api/forms/acme"', "str"],
  ],
  [
    ["  ", "txt"],
    ["method", "attr"],
    ["=", "pu"],
    ['"post"', "str"],
    [">", "pu"],
  ],
  [
    ["  ", "txt"],
    ["<", "pu"],
    ["input", "tag"],
    [" ", "txt"],
    ["name", "attr"],
    ["=", "pu"],
    ['"name"', "str"],
    [" ", "txt"],
    ["placeholder", "attr"],
    ["=", "pu"],
    ['"Name"', "str"],
    [" /", "pu"],
    [">", "pu"],
  ],
  [
    ["  ", "txt"],
    ["<", "pu"],
    ["input", "tag"],
    [" ", "txt"],
    ["name", "attr"],
    ["=", "pu"],
    ['"email"', "str"],
    [" ", "txt"],
    ["type", "attr"],
    ["=", "pu"],
    ['"email"', "str"],
    [" /", "pu"],
    [">", "pu"],
  ],
  [
    ["  ", "txt"],
    ["<", "pu"],
    ["button", "tag"],
    [" ", "txt"],
    ["type", "attr"],
    ["=", "pu"],
    ['"submit"', "str"],
    [">", "pu"],
    ["Send", "txt"],
    ["</", "pu"],
    ["button", "tag"],
    [">", "pu"],
  ],
  [["</", "pu"], ["form", "tag"], [">", "pu"]],
];

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session, isPending: isSessionPending } = useSession();
  const posthog = usePostHog();
  const showAuth = searchParams.get("show_auth") === "true";
  const authRedirect = getSafeAuthRedirect(searchParams.get("redirect"));
  const [authOpen, setAuthOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<"social" | "otp">("social");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpValues, setOtpValues] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isSessionPending) return;

    if (showAuth) {
      storeAuthRedirect(authRedirect);
    }

    if (session && showAuth) {
      setAuthOpen(false);
      navigate(authRedirect, { replace: true });
      return;
    }

    setAuthOpen(showAuth);
  }, [authRedirect, isSessionPending, navigate, session, showAuth]);

  // Scroll to #features / #pricing / #faq when arriving from another page
  // (BrowserRouter doesn't handle hash scrolling itself).
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);

  const handleClose = useCallback(() => {
    setAuthOpen(false);
    setAuthStep("social");
    setOtpEmail("");
    setOtpValues(Array(6).fill(""));
    setOtpError(null);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const openAuth = useCallback(() => {
    if (isSessionPending) {
      setSearchParams(getAuthSearchParams(authRedirect), { replace: true });
      return;
    }

    if (session) {
      navigate(authRedirect);
      return;
    }

    setAuthOpen(true);
    setSearchParams(getAuthSearchParams(authRedirect), { replace: true });
  }, [authRedirect, isSessionPending, navigate, session, setSearchParams]);

  async function handleSignIn(provider: "google" | "facebook") {
    setLoading(provider);
    storeAuthRedirect(authRedirect);
    try {
      await signIn.social({ provider, callbackURL: authRedirect });
    } catch {
      setLoading(null);
    }
  }

  async function handleSendOtp() {
    if (!otpEmail.trim()) return;
    setLoading("email");
    setOtpError(null);
    try {
      const { error } = await emailOtp.sendVerificationOtp({
        email: otpEmail.trim(),
        type: "sign-in",
      });
      if (error) {
        setOtpError(error.message ?? "Failed to send code");
        setLoading(null);
        return;
      }
      setAuthStep("otp");
      setLoading(null);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setOtpError("Failed to send code. Please try again.");
      setLoading(null);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const next = [...otpValues];
    next[index] = value;
    setOtpValues(next);
    setOtpError(null);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...otpValues];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || "";
    }
    setOtpValues(next);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  }

  async function handleVerifyOtp() {
    const code = otpValues.join("");
    if (code.length !== 6) {
      setOtpError("Please enter all 6 digits");
      return;
    }
    setLoading("verify");
    setOtpError(null);
    storeAuthRedirect(authRedirect);
    try {
      const { error } = await signIn.emailOtp({
        email: otpEmail.trim(),
        otp: code,
      });
      if (error) {
        setOtpError(error.message ?? "Invalid code. Please try again.");
        setLoading(null);
        return;
      }
      posthog?.capture("user_signed_in", { method: "email_otp" });
      window.location.href = authRedirect;
    } catch {
      setOtpError("Verification failed. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
      <SEOHead
        canonical="https://linkycal.com/"
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://linkycal.com/#organization",
              name: "LinkyCal",
              url: "https://linkycal.com/",
              logo: {
                "@type": "ImageObject",
                url: "https://linkycal.com/brand/linkycal-icon.svg",
              },
              sameAs: [
                "https://twitter.com/linkycal",
                "https://linkedin.com/company/linkycal",
                "https://github.com/linkycal",
              ],
            },
            {
              "@type": "WebSite",
              "@id": "https://linkycal.com/#website",
              url: "https://linkycal.com/",
              name: "LinkyCal",
              publisher: { "@id": "https://linkycal.com/#organization" },
            },
            {
              "@type": "SoftwareApplication",
              "@id": "https://linkycal.com/#software",
              name: "LinkyCal",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://linkycal.com/",
              description:
                "Form and scheduling infrastructure with multi-step forms, booking links, contacts, workflows, widgets, and APIs.",
              provider: { "@id": "https://linkycal.com/#organization" },
            },
          ],
        }}
      />

      {/* ── 1. Floating Header ──────────────────────────────────────────── */}
      <MarketingNav onGetStarted={openAuth} />

      {/* ── 2. Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-16">
        <div
          aria-hidden="true"
          className="marketing-hero-gradient absolute inset-0 pointer-events-none"
        />

        <div className="max-w-7xl mx-auto px-6 relative pt-32 sm:pt-36">
          {/* Announcement badge */}
          <div className="flex justify-center">
            <Link
              to="/features/api"
              className="inline-flex items-center gap-2.5 rounded-full bg-white/80 backdrop-blur pl-1.5 pr-4 py-1.5 shadow-[0_10px_30px_-18px_rgba(15,26,20,0.5)] hover:bg-white transition-colors"
            >
              <span className="rounded-full bg-[#0F1A14] text-white text-xs font-semibold px-3 py-1">
                New
              </span>
              <span className="text-sm font-medium text-foreground">
                Your agents can now manage your workspace via MCP
              </span>
            </Link>
          </div>

          {/* Headline */}
          <h1 className="font-heading font-bold tracking-[-0.035em] leading-[1.03] text-[2.75rem] sm:text-[3.75rem] lg:text-[4.6rem] text-foreground text-center text-balance max-w-5xl mx-auto mt-8">
            Headless forms and scheduling infrastructure for everyone.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground text-center leading-relaxed max-w-2xl mx-auto mt-6">
            LinkyCal is the{" "}
            <span className="font-semibold text-foreground">
              headless backend
            </span>{" "}
            for forms, scheduling, and enriched contacts. Drop it into every
            project you ship, keep your own frontend, and let us handle storage,
            spam, and follow-up.
          </p>

          {/* CTA */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
            <button
              onClick={openAuth}
              className="marketing-pill-cta h-14 pl-8 pr-2.5 gap-3 text-[15px] font-medium"
            >
              Build your free form
              <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
            <CopyLlmsButton
              className="inline-flex items-center gap-2.5 h-14 px-7 rounded-full bg-white/70 backdrop-blur border border-[#0F1A14]/8 text-[15px] font-medium text-foreground hover:bg-white transition-colors cursor-pointer"
              iconClassName="w-[18px] h-[18px]"
            />
          </div>

          {/* Product showcase cards */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6 mt-16 sm:mt-20">
            {/* Form builder screenshot */}
            <div className="marketing-card p-5 flex flex-col">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Link2 className="w-[18px] h-[18px] text-brand" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Share via link or embed in your site
                  </h3>
                </div>
                <p className="text-sm text-brand font-medium leading-relaxed">
                  No code required. Share the hosted link or paste an embed.
                </p>
              </div>
              <div className="relative aspect-[4/3] rounded-[18px] overflow-hidden border border-border/40 bg-white">
                <img
                  src="/screenshots/form-builder.webp"
                  alt="LinkyCal form builder editing a multi-step quote form"
                  loading="eager"
                  className="absolute inset-0 w-full h-full object-cover object-left-top"
                />
              </div>
            </div>

            {/* Native HTML snippet */}
            <div className="marketing-card p-5 flex flex-col">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Code2 className="w-[18px] h-[18px] text-brand" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Bring your own front-end
                  </h3>
                </div>
                <p className="text-sm text-brand font-medium leading-relaxed">
                  Robust backend for your native HTML and JavaScript forms.
                </p>
              </div>
              <div className="relative flex-1 min-h-0 rounded-[18px] overflow-hidden bg-gradient-to-b from-[#14241c] to-[#0d1712] ring-1 ring-white/[0.06] p-5 flex flex-col">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10"
                />
                {/* Window chrome */}
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="flex items-center gap-[5px]">
                    <div className="w-[9px] h-[9px] rounded-full bg-[#EC6A5E]/70" />
                    <div className="w-[9px] h-[9px] rounded-full bg-[#F5BF4F]/70" />
                    <div className="w-[9px] h-[9px] rounded-full bg-[#61C554]/70" />
                  </div>
                  <span className="ml-1.5 font-mono text-[11px] text-[#7fa890]">
                    contact-form.html
                  </span>
                </div>

                {/* Code */}
                <div className="flex-1 overflow-x-auto font-mono text-[12px] leading-[1.85]">
                  {HERO_CODE.map((line, i) => (
                    <div key={i} className="flex">
                      <span className="select-none shrink-0 w-4 mr-4 text-right text-[#3f5a4d] tabular-nums">
                        {i + 1}
                      </span>
                      <code className="whitespace-pre">
                        {line.map((token, j) => (
                          <span key={j} className={SYN[token[1]]}>
                            {token[0]}
                          </span>
                        ))}
                      </code>
                    </div>
                  ))}
                </div>

                <p className="mt-auto pt-4 font-mono text-[11px] text-[#5f7e6d]">
                  Stored, spam-checked, piped to your workflows.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Toolkit ──────────────────────────────────────────────────── */}
      <ToolkitSection />

      {/* ── Before / After ──────────────────────────────────────────────── */}
      <ComparisonSection />

      {/* ── 4. How It Works ─────────────────────────────────────────────── */}
      <HowItWorksSection />

      {/* ── 5. Integrations ─────────────────────────────────────────────── */}
      <IntegrationsSection />

      {/* ── 6. Headless / Developers ────────────────────────────────────── */}
      <HeadlessSection />

      {/* ── 7. Testimonial ──────────────────────────────────────────────── */}
      <TestimonialSection />

      {/* ── 7. Pricing ──────────────────────────────────────────────────── */}
      <PricingSection onGetStarted={openAuth} />

      {/* ── 8. FAQ ──────────────────────────────────────────────────────── */}
      <FaqSection />

      {/* ── 9. Final CTA ────────────────────────────────────────────────── */}
      <FinalCtaSection onGetStarted={openAuth} />

      {/* ── 10. Footer ──────────────────────────────────────────────────── */}
      <MarketingFooter />

      {/* ── 15. Auth Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={authOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader className="items-start">
            <Logo size="sm" iconOnly />
            <DialogTitle className="mt-5">Sign in to LinkyCal</DialogTitle>
            <DialogDescription className="mt-1">
              {authStep === "social"
                ? "Choose a provider to continue"
                : `Enter the 6-digit code sent to ${otpEmail}`}
            </DialogDescription>
          </DialogHeader>

          {authStep === "social" ? (
            <>
              <div className="flex flex-col gap-3 mt-4">
                <button
                  onClick={() => handleSignIn("google")}
                  disabled={loading !== null}
                  className="flex items-center justify-center gap-3 h-11 w-full rounded-[14px] border border-border bg-white text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {loading === "google" ? "Redirecting..." : "Continue with Google"}
                </button>
                <button
                  onClick={() => handleSignIn("facebook")}
                  disabled={loading !== null}
                  className="flex items-center justify-center gap-3 h-11 w-full rounded-[14px] border border-border bg-white text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="#1877F2"
                  >
                    <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.47h-2.796v8.384C19.612 22.954 24 17.99 24 12z" />
                  </svg>
                  {loading === "facebook" ? "Redirecting..." : "Continue with Facebook"}
                </button>
              </div>

              <div className="flex items-center gap-3 mt-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendOtp();
                }}
                className="flex flex-col gap-3"
              >
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  disabled={loading !== null}
                  className="h-11 w-full rounded-[12px] border border-border bg-muted/50 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                />
                {otpError && (
                  <p className="text-xs text-red-500 text-center">{otpError}</p>
                )}
                <button
                  type="submit"
                  disabled={loading !== null || !otpEmail.trim()}
                  className="flex items-center justify-center gap-2 h-11 w-full rounded-[14px] bg-[#1B4332] text-sm font-medium text-white hover:bg-[#1B4332]/90 transition-colors disabled:opacity-50"
                >
                  {loading === "email" ? "Sending code..." : "Continue with email"}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otpValues.map((val, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={val}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={loading === "verify"}
                    className="h-12 w-11 rounded-[10px] border border-border bg-muted/50 text-center text-lg font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                  />
                ))}
              </div>
              {otpError && (
                <p className="text-xs text-red-500 text-center">{otpError}</p>
              )}
              <button
                onClick={handleVerifyOtp}
                disabled={loading === "verify" || otpValues.join("").length !== 6}
                className="flex items-center justify-center gap-2 h-11 w-full rounded-[14px] bg-[#1B4332] text-sm font-medium text-white hover:bg-[#1B4332]/90 transition-colors disabled:opacity-50"
              >
                {loading === "verify" ? "Verifying..." : "Verify & sign in"}
              </button>
              <button
                onClick={() => {
                  setAuthStep("social");
                  setOtpValues(Array(6).fill(""));
                  setOtpError(null);
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                &larr; Back
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center mt-3">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
