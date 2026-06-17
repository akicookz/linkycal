import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { CalendarCheck, ArrowRight, FileText } from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { signIn, emailOtp, useSession } from "@/lib/auth-client";
import { usePostHog } from "@posthog/react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import {
  ToolkitSection,
  HowItWorksSection,
  IntegrationsSection,
  HeadlessSection,
  TestimonialSection,
  PricingSection,
  FaqSection,
  FinalCtaSection,
} from "@/components/marketing/MarketingSections";

/* ─── Landing Page ────────────────────────────────────────────────────────── */

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session, isPending: isSessionPending } = useSession();
  const posthog = usePostHog();
  const showAuth = searchParams.get("show_auth") === "true";
  const [authOpen, setAuthOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<"social" | "otp">("social");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpValues, setOtpValues] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isSessionPending) return;

    if (session && showAuth) {
      setAuthOpen(false);
      navigate("/app", { replace: true });
      return;
    }

    setAuthOpen(showAuth);
  }, [isSessionPending, navigate, session, showAuth]);

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
      setSearchParams({ show_auth: "true" }, { replace: true });
      return;
    }

    if (session) {
      navigate("/app");
      return;
    }

    setAuthOpen(true);
    setSearchParams({ show_auth: "true" }, { replace: true });
  }, [isSessionPending, navigate, session, setSearchParams]);

  async function handleSignIn(provider: "google" | "facebook") {
    setLoading(provider);
    try {
      await signIn.social({ provider, callbackURL: "/app" });
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
      window.location.href = "/app";
    } catch {
      setOtpError("Verification failed. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
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
                AI agents can now book you via MCP
              </span>
            </Link>
          </div>

          {/* Headline */}
          <h1 className="font-heading font-bold tracking-[-0.035em] leading-[1.03] text-[2.75rem] sm:text-[3.75rem] lg:text-[4.6rem] text-foreground text-center text-balance max-w-5xl mx-auto mt-8">
            Forms and scheduling in just a few clicks.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground text-center leading-relaxed max-w-2xl mx-auto mt-6">
            Effortless forms and scheduling infrastructure for{" "}
            <span className="font-semibold text-foreground">vibe coders</span>.
          </p>

          {/* CTA */}
          <div className="flex justify-center mt-9">
            <button
              onClick={openAuth}
              className="marketing-pill-cta h-14 pl-8 pr-2.5 gap-3 text-[15px] font-medium"
            >
              Get Started — it&rsquo;s free
              <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>

          {/* Product showcase cards */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6 mt-16 sm:mt-20">
            {/* Form builder screenshot */}
            <div className="marketing-card p-5 flex flex-col">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-brand" />
                  <h3 className="text-base font-semibold text-foreground">
                    Visual form builder
                  </h3>
                </div>
                <p className="text-sm text-brand font-medium leading-relaxed">
                  Multi-step forms with conditional logic, built in minutes.
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

            {/* Booking page screenshot */}
            <div className="marketing-card p-5 flex flex-col">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarCheck className="w-4 h-4 text-brand" />
                  <h3 className="text-base font-semibold text-foreground">
                    Hosted booking pages
                  </h3>
                </div>
                <p className="text-sm text-brand font-medium leading-relaxed">
                  Visitors pick a time — availability stays in sync with your
                  calendar.
                </p>
              </div>
              <div className="relative flex-1 min-h-0 aspect-[4/3] lg:aspect-auto rounded-[18px] overflow-hidden border border-border/40 bg-white">
                <img
                  src="/screenshots/booking.webp"
                  alt="LinkyCal hosted booking page with date and time slot picker"
                  loading="eager"
                  className="absolute inset-0 w-full h-full object-cover object-left-top"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Toolkit ──────────────────────────────────────────────────── */}
      <ToolkitSection />

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
            <Logo size="lg" />
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
