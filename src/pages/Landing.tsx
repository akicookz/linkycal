import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FileText,
  CalendarCheck,
  Users,
  Code2,
  Zap,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Tag,
  Globe,
  Mail,
  Star,
  Send,
  Palette,
  Terminal,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { PricingCards } from "@/components/PricingCards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { signIn, emailOtp } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/* ─── Hero: Website Card (Calendar → Form → Confirmation) ────────────────── */

// March 2026 starts on Sunday (day 0). 31 days.
const MAR_2026_OFFSET = 0; // Sunday = 0 offset
const MAR_2026_DAYS = 31;
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function HeroWebsiteCard() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // screen: 0 = calendar, 1 = form, 2 = confirmation
  const screen = phase <= 3 ? 0 : phase <= 6 ? 1 : 2;

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 1000);   // select date 24
    t(() => setPhase(2), 2000);   // select time 2:00 PM
    t(() => setPhase(3), 3000);   // Continue activates
    t(() => setPhase(4), 4000);   // crossfade to form, name fills
    t(() => setPhase(5), 5000);   // email fills
    t(() => setPhase(6), 6200);   // Submit activates
    t(() => setPhase(7), 7200);   // crossfade to confirmation
    t(() => setPhase(0), 9500);   // loop

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build calendar grid cells
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < MAR_2026_OFFSET; i++) calendarCells.push(null);
  for (let d = 1; d <= MAR_2026_DAYS; d++) calendarCells.push(d);
  while (calendarCells.length < 35) calendarCells.push(null);

  return (
    <div className="card-glow-primary p-5">
      {/* Card header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-brand" />
          <h3 className="text-base font-semibold text-foreground">
            For Your Website
          </h3>
        </div>
        <p className="text-sm text-brand font-medium text-shadow-md leading-relaxed">
          Embed booking pages and forms directly into your site with one line of
          code.
        </p>
      </div>

      {/* Browser chrome */}
      <div className="rounded-3xl border border-border/40 overflow-hidden">
        {/* Browser bar */}
        <div className="flex items-center gap-2.5 px-4 py-[7px] bg-muted border-b border-border/30">
          <div className="flex gap-[6px]">
            <div className="w-[8px] h-[8px] rounded-full bg-[#EC6A5E]" />
            <div className="w-[8px] h-[8px] rounded-full bg-[#F5BF4F]" />
            <div className="w-[8px] h-[8px] rounded-full bg-[#61C554]" />
          </div>
          <div className="flex-1 h-[20px] rounded-md bg-white/80 flex items-center justify-center px-2">
            <span className="text-[9px] text-muted-foreground truncate">
              yoursite.com/book-a-demo
            </span>
          </div>
        </div>

        {/* Page */}
        <div className="bg-white relative overflow-hidden">
          {/* Site nav skeleton */}
          <div className="flex items-center gap-4 px-5 py-2.5 border-b border-[#F0F0F0]">
            <div className="w-[18px] h-[18px] rounded-[4px] bg-[#E8E8E8]" />
            <div className="h-[5px] w-10 rounded-full bg-[#E8E8E8]" />
            <div className="h-[5px] w-8 rounded-full bg-[#E8E8E8]" />
            <div className="h-[5px] w-9 rounded-full bg-[#E8E8E8]" />
            <div className="ml-auto h-[18px] w-14 rounded-full bg-[#E8E8E8]" />
          </div>

          {/* Page content */}
          <div className="px-5 py-4">
            {/* Page heading skeleton */}
            <div className="mb-1">
              <div className="h-[7px] w-32 rounded-full bg-[#D8D8D8] mb-[6px]" />
              <div className="h-[5px] w-48 rounded-full bg-[#E8E8E8]" />
            </div>

            {/* The injected widget — no wrapper, no borders, lives inline in the page */}
            <div className="max-w-[260px] mx-auto mt-4 relative" style={{ minHeight: 280 }}>
              {/* Screen 0: Calendar */}
              <div
                className={cn(
                  "transition-all duration-500",
                  screen === 0
                    ? "opacity-100"
                    : "opacity-0 absolute inset-x-0 top-0 pointer-events-none",
                )}
              >
                {/* Month nav */}
                <div className="flex items-center justify-between mb-2">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                    <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[10px] font-semibold text-foreground">
                    March 2026
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7">
                  {DAY_HEADERS.map((d) => (
                    <div
                      key={d}
                      className="text-[8px] font-medium text-muted-foreground text-center h-5 flex items-center justify-center"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Date grid */}
                <div className="grid grid-cols-7">
                  {calendarCells.map((day, i) => {
                    if (day === null) {
                      return <div key={`e-${i}`} className="h-[30px]" />;
                    }
                    const isWeekend = i % 7 === 0 || i % 7 === 6;
                    const isPast = day < 18;
                    const isSelected = day === 24 && phase >= 1;
                    const isToday = day === 18;
                    return (
                      <div
                        key={day}
                        className="h-[30px] flex items-center justify-center"
                      >
                        <div
                          className={cn(
                            "w-[24px] h-[24px] rounded-full flex items-center justify-center text-[10px] transition-all duration-300",
                            isSelected
                              ? "bg-brand text-white font-medium"
                              : isToday
                                ? "ring-1 ring-brand/30 text-brand font-medium"
                                : isPast
                                  ? "text-muted-foreground/30"
                                  : isWeekend
                                    ? "text-[#AAA]"
                                    : "text-foreground/80",
                          )}
                        >
                          {day}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Time slots */}
                <div className="flex gap-[6px] mt-3">
                  {["10:00 AM", "2:00 PM", "4:00 PM"].map((slot) => (
                    <div
                      key={slot}
                      className={cn(
                        "h-[28px] flex-1 rounded-full border flex items-center justify-center text-[9px] font-medium transition-all duration-400",
                        phase >= 2 && slot === "2:00 PM"
                          ? "border-brand bg-brand/8 text-brand"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {slot}
                    </div>
                  ))}
                </div>

                {/* Continue */}
                <div
                  className={cn(
                    "mt-2.5 h-[30px] rounded-full flex items-center justify-center text-[10px] font-medium transition-all duration-500",
                    phase >= 3
                      ? "bg-brand text-white"
                      : "bg-muted text-muted-foreground/50",
                  )}
                >
                  Continue
                  <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>

              {/* Screen 1: Form */}
              <div
                className={cn(
                  "transition-all duration-500",
                  screen === 1
                    ? "opacity-100"
                    : screen < 1
                      ? "opacity-0 translate-y-3 absolute inset-x-0 top-0 pointer-events-none"
                      : "opacity-0 -translate-y-3 absolute inset-x-0 top-0 pointer-events-none",
                )}
              >
                <div className="text-[10px] font-semibold text-foreground mb-3">
                  Your Details
                </div>

                <div className="mb-2.5">
                  <div className="text-[9px] font-medium text-muted-foreground mb-1">
                    Name
                  </div>
                  <div
                    className={cn(
                      "h-[30px] rounded-full border px-3 flex items-center text-[10px] transition-all duration-500",
                      phase >= 4
                        ? "border-brand/30 text-foreground"
                        : "border-border text-transparent",
                    )}
                  >
                    {phase >= 4 && (
                      <span className="animate-[messageIn_0.3s_ease-out_forwards]">
                        Sarah Chen
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-2.5">
                  <div className="text-[9px] font-medium text-muted-foreground mb-1">
                    Email
                  </div>
                  <div
                    className={cn(
                      "h-[30px] rounded-full border px-3 flex items-center text-[10px] transition-all duration-500",
                      phase >= 5
                        ? "border-brand/30 text-foreground"
                        : "border-border text-transparent",
                    )}
                  >
                    {phase >= 5 && (
                      <span className="animate-[messageIn_0.3s_ease-out_forwards]">
                        sarah@acme.com
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-1.5 text-[9px] text-muted-foreground px-1">
                  <CalendarCheck className="w-3 h-3 text-brand" />
                  Tue, Mar 24 at 2:00 PM · 30 min
                </div>

                <div
                  className={cn(
                    "h-[30px] rounded-full flex items-center justify-center text-[10px] font-medium transition-all duration-500",
                    phase >= 6
                      ? "bg-brand text-white"
                      : "bg-muted text-muted-foreground/50",
                  )}
                >
                  Confirm Booking
                </div>
              </div>

              {/* Screen 2: Confirmation */}
              <div
                className={cn(
                  "transition-all duration-500",
                  screen === 2
                    ? "opacity-100"
                    : "opacity-0 scale-95 absolute inset-x-0 top-0 pointer-events-none",
                )}
              >
                <div className="flex flex-col items-center pt-8 pb-4">
                  <div className="w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center mb-3 animate-[messageIn_0.3s_ease-out_forwards]">
                    <Check className="w-5 h-5 text-brand" />
                  </div>
                  <div className="text-[12px] font-semibold text-foreground">
                    Booking confirmed!
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 text-center">
                    Tue, Mar 24 at 2:00 PM with Sarah Chen
                  </div>
                  <div className="text-[9px] text-[#AAA] mt-0.5">
                    Confirmation sent to sarah@acme.com
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom page skeleton */}
            <div className="mt-4 pt-3 border-t border-[#F0F0F0]">
              <div className="flex gap-6">
                <div className="space-y-[5px]">
                  <div className="h-[5px] w-12 rounded-full bg-[#E8E8E8]" />
                  <div className="h-[4px] w-16 rounded-full bg-muted" />
                  <div className="h-[4px] w-14 rounded-full bg-muted" />
                </div>
                <div className="space-y-[5px]">
                  <div className="h-[5px] w-10 rounded-full bg-[#E8E8E8]" />
                  <div className="h-[4px] w-14 rounded-full bg-muted" />
                  <div className="h-[4px] w-12 rounded-full bg-muted" />
                </div>
                <div className="space-y-[5px]">
                  <div className="h-[5px] w-14 rounded-full bg-[#E8E8E8]" />
                  <div className="h-[4px] w-10 rounded-full bg-muted" />
                  <div className="h-[4px] w-16 rounded-full bg-muted" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Hero: Agent Card (Telegram-style Chat Mock) ────────────────────────── */

function HeroAgentChat() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 600);
    t(() => setPhase(2), 2000);
    t(() => setPhase(3), 3500);
    t(() => setPhase(4), 5200);
    t(() => setPhase(0), 8500);

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card-glow-primary p-5 flex flex-col">
      {/* Card header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-brand" />
          <h3 className="text-base font-semibold text-foreground">
            For Your Agents
          </h3>
        </div>
        <p className="text-sm text-brand font-medium text-shadow-md leading-relaxed">
          Let AI agents create bookings and manage contacts through a simple
          API.
        </p>
      </div>

      {/* Telegram-style chat mock */}
      <div className="rounded-3xl border border-border/40 overflow-hidden flex flex-col flex-1">
        {/* Telegram header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-border/30 shrink-0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#4EA4F6] shrink-0">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="w-8 h-8 rounded-full bg-[#4EA4C0] flex items-center justify-center shrink-0">
            <span className="text-sm leading-none">🦀</span>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[#000] leading-tight truncate">
              OpenClaw Agent
            </div>
            <div className="text-[9px] text-[#4EA4F6] leading-tight">
              online
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 bg-[#EEF2F4] flex flex-col px-3 py-2.5 gap-[6px] overflow-hidden relative">
          {/* User message */}
          <div
            className={cn(
              "flex justify-end transition-all duration-500",
              phase >= 1
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-3",
            )}
          >
            <div className="max-w-[80%]">
              <div className="bg-[#EEFFDE] rounded-t-[8px] rounded-bl-[8px] rounded-br-[2px] px-2.5 py-[6px]">
                <p className="text-[11px] text-[#000] leading-[1.4]">
                  Book a 30min demo with Sarah Chen for next Tuesday at 2pm
                </p>
                <p className="text-[8px] text-[#6EB869] text-right mt-px leading-none">2:14 PM</p>
              </div>
            </div>
          </div>

          {/* Typing indicator */}
          <div
            className={cn(
              "flex justify-start transition-all duration-500",
              phase === 2
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-2 absolute",
            )}
          >
            <div className="bg-white rounded-t-[8px] rounded-br-[8px] rounded-bl-[2px] px-3 py-2 flex items-center gap-1">
              <div className="w-[5px] h-[5px] rounded-full bg-[#B0B0B0] animate-[typingDot_1.4s_ease-in-out_infinite]" />
              <div className="w-[5px] h-[5px] rounded-full bg-[#B0B0B0] animate-[typingDot_1.4s_ease-in-out_infinite_0.2s]" />
              <div className="w-[5px] h-[5px] rounded-full bg-[#B0B0B0] animate-[typingDot_1.4s_ease-in-out_infinite_0.4s]" />
            </div>
          </div>

          {/* Agent reply */}
          <div
            className={cn(
              "flex justify-start transition-all duration-500",
              phase >= 3
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-3",
            )}
          >
            <div className="max-w-[80%]">
              <div className="bg-white rounded-t-[8px] rounded-br-[8px] rounded-bl-[2px] px-2.5 py-[6px]">
                <p className="text-[11px] text-[#000] leading-[1.4]">
                  Done! I've booked a 30min demo with Sarah Chen for Tue, Mar 24
                  at 2:00 PM. Confirmation sent to sarah@acme.com
                </p>
                <p className="text-[8px] text-[#B0B0B0] text-right mt-px leading-none">2:14 PM</p>
              </div>
            </div>
          </div>

          {/* Booking card */}
          <div
            className={cn(
              "flex justify-start transition-all duration-500",
              phase >= 4
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-3",
            )}
          >
            <div className="max-w-[80%]">
              <div className="bg-white rounded-t-[8px] rounded-br-[8px] rounded-bl-[2px] px-2.5 py-[6px]">
                <div className="border-l-2 border-[#4EA4F6] pl-2 py-px">
                  <div className="text-[10px] font-semibold text-[#4EA4F6] leading-snug">
                    Booking Created
                  </div>
                  <div className="text-[10px] text-[#000] leading-snug">
                    Sarah Chen
                  </div>
                  <div className="text-[10px] text-[#8E8E93] leading-snug">
                    Tue, Mar 24 · 2:00 PM · 30min
                  </div>
                  <div className="text-[10px] text-[#8E8E93] leading-snug">
                    sarah@acme.com
                  </div>
                </div>
                <p className="text-[8px] text-[#B0B0B0] text-right mt-px leading-none">2:15 PM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Telegram input bar */}
        <div className="flex items-center gap-2 px-2.5 py-[7px] bg-white border-t border-border/30 shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-[#B8B8B8] shrink-0">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex-1 h-[28px] rounded-full bg-[#F4F4F4] flex items-center px-3">
            <span className="text-[10px] text-[#B8B8B8]">Message</span>
          </div>
          <div className="w-[28px] h-[28px] rounded-full bg-[#4EA4F6] flex items-center justify-center shrink-0">
            <Send className="w-3 h-3 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Bento: Animated Multi-step Form ────────────────────────────────────── */

function BentoMultiStepForm() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // screen: 0 = step 1 (contact), 1 = step 2 (preferences), 2 = confirmation
  const screen = phase <= 4 ? 0 : phase <= 7 ? 1 : 2;

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 800);    // name fills
    t(() => setPhase(2), 1600);   // email fills
    t(() => setPhase(3), 2400);   // phone fills
    t(() => setPhase(4), 3200);   // Next activates
    t(() => setPhase(5), 4000);   // crossfade to step 2, company fills
    t(() => setPhase(6), 5000);   // select fills "Referral"
    t(() => setPhase(7), 6000);   // Next activates
    t(() => setPhase(8), 7000);   // crossfade to confirmation
    t(() => setPhase(0), 9500);   // loop

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pagination bars
  const bars = screen === 0
    ? ["bg-brand", "bg-[#E0E0E0]", "bg-[#E0E0E0]"]
    : screen === 1
      ? ["bg-brand/40", "bg-brand", "bg-[#E0E0E0]"]
      : ["bg-brand/40", "bg-brand/40", "bg-brand"];

  return (
    <div className="lg:row-span-3 card-glow-primary p-8 flex flex-col">
      <div className="w-10 h-10 rounded-sm bg-brand/10 flex items-center justify-center mb-5">
        <Sparkles className="w-5 h-5 text-brand" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Multi-step forms with conditional logic
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        Build forms that adapt to each user. Show or hide fields based
        on answers, split complex flows into digestible steps, and
        validate everything in real-time.
      </p>

      {/* Form mock area */}
      <div className="flex-1 flex flex-col justify-end">
        <div className="max-w-[320px] mx-auto w-full relative" style={{ minHeight: 260 }}>
          {/* Screen 0: Step 1 — Contact Info */}
          <div
            className={cn(
              "transition-all duration-500",
              screen === 0
                ? "opacity-100"
                : "opacity-0 absolute inset-x-0 top-0 pointer-events-none",
            )}
          >
            <div className="space-y-3">
              <div className="mb-1">
                <div className="text-[13px] font-semibold text-foreground">Contact Info</div>
                <div className="text-[10px] text-muted-foreground">Tell us how to reach you</div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">Name</div>
                <div className={cn(
                  "h-[30px] rounded-full border px-3 flex items-center text-[11px] transition-all duration-500",
                  phase >= 1 ? "border-brand/30 text-foreground" : "border-border",
                )}>
                  {phase >= 1 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">Sarah Chen</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">Email</div>
                <div className={cn(
                  "h-[30px] rounded-full border px-3 flex items-center text-[11px] transition-all duration-500",
                  phase >= 2 ? "border-brand/30 text-foreground" : "border-border",
                )}>
                  {phase >= 2 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">sarah@acme.com</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">Phone</div>
                <div className={cn(
                  "h-[30px] rounded-full border px-3 flex items-center text-[11px] transition-all duration-500",
                  phase >= 3 ? "border-brand/30 text-foreground" : "border-border",
                )}>
                  {phase >= 3 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">+1 (555) 234-5678</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Screen 1: Step 2 — Preferences */}
          <div
            className={cn(
              "transition-all duration-500",
              screen === 1
                ? "opacity-100"
                : screen < 1
                  ? "opacity-0 translate-y-3 absolute inset-x-0 top-0 pointer-events-none"
                  : "opacity-0 -translate-y-3 absolute inset-x-0 top-0 pointer-events-none",
            )}
          >
            <div className="space-y-3">
              <div className="mb-1">
                <div className="text-[13px] font-semibold text-foreground">Preferences</div>
                <div className="text-[10px] text-muted-foreground">Help us understand your needs</div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">Company</div>
                <div className={cn(
                  "h-[30px] rounded-full border px-3 flex items-center text-[11px] transition-all duration-500",
                  phase >= 5 ? "border-brand/30 text-foreground" : "border-border",
                )}>
                  {phase >= 5 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">Acme Inc</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">How did you hear about us?</div>
                <div className={cn(
                  "h-[30px] rounded-full border px-3 flex items-center justify-between text-[11px] transition-all duration-500",
                  phase >= 6 ? "border-brand/30 text-foreground" : "border-border text-muted-foreground/50",
                )}>
                  <span>{phase >= 6 ? "Referral" : "Select..."}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">Team size</div>
                <div className="h-[30px] rounded-full border border-border px-3 flex items-center justify-between text-[11px] text-muted-foreground/50">
                  <span>Select...</span>
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>

          {/* Screen 2: Confirmation */}
          <div
            className={cn(
              "transition-all duration-500",
              screen === 2
                ? "opacity-100"
                : "opacity-0 scale-95 absolute inset-x-0 top-0 pointer-events-none",
            )}
          >
            <div className="flex flex-col items-center pt-10 pb-4">
              <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center mb-3 animate-[messageIn_0.3s_ease-out_forwards]">
                <Check className="w-6 h-6 text-brand" />
              </div>
              <div className="text-[13px] font-semibold text-foreground">
                Response submitted!
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                We&apos;ll be in touch shortly.
              </div>
            </div>
          </div>
        </div>

        {/* Pagination + Button */}
        <div className="max-w-[320px] mx-auto w-full mt-4">
          {/* Pagination bars */}
          <div className="flex gap-1.5 mb-3">
            {bars.map((bg, i) => (
              <div key={i} className={cn("h-[3px] flex-1 rounded-full transition-all duration-500", bg)} />
            ))}
          </div>

          {/* Button */}
          <div
            className={cn(
              "h-[32px] rounded-full flex items-center justify-center text-[11px] font-medium transition-all duration-500",
              screen === 2
                ? "bg-brand/10 text-brand"
                : (phase === 4 || phase === 7)
                  ? "bg-brand text-white"
                  : "bg-muted text-muted-foreground/50",
            )}
          >
            {screen === 2 ? "Done" : "Next"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock Form Builder UI ────────────────────────────────────────────────── */

function MockFormBuilderUI() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const screen = phase <= 5 ? 0 : phase <= 8 ? 1 : 2;

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 1000);    // name fills
    t(() => setPhase(2), 1800);    // email fills
    t(() => setPhase(3), 2600);    // company fills → triggers conditional
    t(() => setPhase(4), 3400);    // conditional "Company Size" slides in + fills
    t(() => setPhase(5), 4200);    // Next activates
    t(() => setPhase(6), 5000);    // crossfade to step 2, budget fills
    t(() => setPhase(7), 6000);    // timeline select fills
    t(() => setPhase(8), 7000);    // Next activates
    t(() => setPhase(9), 8000);    // confirmation
    t(() => setPhase(0), 10500);   // loop

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const bars = screen === 0
    ? ["bg-brand", "bg-[#E0E0E0]", "bg-[#E0E0E0]"]
    : screen === 1
      ? ["bg-brand/40", "bg-brand", "bg-[#E0E0E0]"]
      : ["bg-brand/40", "bg-brand/40", "bg-brand"];

  return (
    <div className="card-glow-secondary p-8 rounded-[20px]">
      <div className="max-w-[360px] mx-auto relative" style={{ minHeight: 320 }}>
        {/* Screen 0: Step 1 — Contact Info */}
        <div
          className={cn(
            "transition-all duration-500",
            screen === 0
              ? "opacity-100"
              : "opacity-0 absolute inset-x-0 top-0 pointer-events-none",
          )}
        >
          <div className="mb-4">
            <div className="text-[15px] font-semibold text-foreground">Contact Info</div>
            <div className="text-[12px] text-muted-foreground">Tell us how to reach you</div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Full Name</div>
              <div className={cn(
                "h-[36px] rounded-full border px-4 flex items-center text-[13px] transition-all duration-500",
                phase >= 1 ? "border-brand/30 text-foreground" : "border-border",
              )}>
                {phase >= 1 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">Alex Morgan</span>}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Email Address</div>
              <div className={cn(
                "h-[36px] rounded-full border px-4 flex items-center text-[13px] transition-all duration-500",
                phase >= 2 ? "border-brand/30 text-foreground" : "border-border",
              )}>
                {phase >= 2 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">alex@acme.com</span>}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Company</div>
              <div className={cn(
                "h-[36px] rounded-full border px-4 flex items-center text-[13px] transition-all duration-500",
                phase >= 3 ? "border-brand/30 text-foreground" : "border-border",
              )}>
                {phase >= 3 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">Acme Inc</span>}
              </div>
            </div>

            {/* Conditional field — slides in after Company is filled */}
            <div
              className={cn(
                "transition-all duration-500 overflow-hidden",
                phase >= 4
                  ? "max-h-24 opacity-100"
                  : "max-h-0 opacity-0",
              )}
            >
              <div className="animate-[fadeSlideIn_0.3s_ease-out_forwards]">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="text-[11px] font-medium text-muted-foreground">Company Size</div>
                  <span className="text-[8px] text-brand bg-brand/8 px-1.5 py-0.5 rounded-full font-medium">
                    Conditional
                  </span>
                </div>
                <div className={cn(
                  "h-[36px] rounded-full border px-4 flex items-center text-[13px] transition-all duration-500",
                  phase >= 4 ? "border-brand/30 text-foreground" : "border-border",
                )}>
                  <span className="animate-[messageIn_0.3s_ease-out_forwards]">50–200</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Screen 1: Step 2 — Project Details */}
        <div
          className={cn(
            "transition-all duration-500",
            screen === 1
              ? "opacity-100"
              : screen < 1
                ? "opacity-0 translate-y-3 absolute inset-x-0 top-0 pointer-events-none"
                : "opacity-0 -translate-y-3 absolute inset-x-0 top-0 pointer-events-none",
          )}
        >
          <div className="mb-4">
            <div className="text-[15px] font-semibold text-foreground">Project Details</div>
            <div className="text-[12px] text-muted-foreground">Tell us about your project</div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Budget Range</div>
              <div className={cn(
                "h-[36px] rounded-full border px-4 flex items-center justify-between text-[13px] transition-all duration-500",
                phase >= 6 ? "border-brand/30 text-foreground" : "border-border text-muted-foreground/50",
              )}>
                <span>{phase >= 6 ? "$10k – $50k" : "Select..."}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Timeline</div>
              <div className={cn(
                "h-[36px] rounded-full border px-4 flex items-center justify-between text-[13px] transition-all duration-500",
                phase >= 7 ? "border-brand/30 text-foreground" : "border-border text-muted-foreground/50",
              )}>
                <span>{phase >= 7 ? "1–3 months" : "Select..."}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Additional Notes</div>
              <div className="h-[36px] rounded-full border border-border px-4 flex items-center text-[13px] text-muted-foreground/50">
                Optional...
              </div>
            </div>
          </div>
        </div>

        {/* Screen 2: Confirmation */}
        <div
          className={cn(
            "transition-all duration-500",
            screen === 2
              ? "opacity-100"
              : "opacity-0 scale-95 absolute inset-x-0 top-0 pointer-events-none",
          )}
        >
          <div className="flex flex-col items-center pt-14 pb-6">
            <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center mb-3 animate-[messageIn_0.3s_ease-out_forwards]">
              <Check className="w-7 h-7 text-brand" />
            </div>
            <div className="text-[15px] font-semibold text-foreground">
              Response submitted!
            </div>
            <div className="text-[12px] text-muted-foreground mt-1">
              We&apos;ll be in touch within 24 hours.
            </div>
          </div>
        </div>
      </div>

      {/* Pagination + Button */}
      <div className="max-w-[360px] mx-auto mt-5">
        <div className="flex gap-1.5 mb-3">
          {bars.map((bg, i) => (
            <div key={i} className={cn("h-[3px] flex-1 rounded-full transition-all duration-500", bg)} />
          ))}
        </div>
        <div
          className={cn(
            "h-[36px] rounded-full flex items-center justify-center text-[12px] font-medium transition-all duration-500",
            screen === 2
              ? "bg-brand/10 text-brand"
              : (phase === 5 || phase === 8)
                ? "bg-brand text-white"
                : "bg-muted text-muted-foreground/50",
          )}
        >
          {screen === 2 ? "Done" : "Next"}
        </div>
      </div>
    </div>
  );
}

/* ─── Mock Booking UI ─────────────────────────────────────────────────────── */

function MockBookingUI() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const screen = phase <= 4 ? 0 : phase <= 7 ? 1 : 2;

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 1000);    // date 24 selects
    t(() => setPhase(2), 2000);    // time slots appear
    t(() => setPhase(3), 2800);    // 2:00 PM selects
    t(() => setPhase(4), 3600);    // Next activates
    t(() => setPhase(5), 4400);    // crossfade to details, name fills
    t(() => setPhase(6), 5200);    // email fills
    t(() => setPhase(7), 6000);    // Confirm activates
    t(() => setPhase(8), 6800);    // confirmation
    t(() => setPhase(0), 9500);    // loop

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const bars = screen === 0
    ? ["bg-brand", "bg-border", "bg-border"]
    : screen === 1
      ? ["bg-brand/40", "bg-brand", "bg-border"]
      : ["bg-brand/40", "bg-brand/40", "bg-brand"];

  // Calendar cells
  const bookingCells: (number | null)[] = [];
  for (let d = 1; d <= MAR_2026_DAYS; d++) bookingCells.push(d);
  while (bookingCells.length < 35) bookingCells.push(null);

  return (
    <div className="card-glow-secondary p-8 rounded-xl">
      <div className="max-w-[380px] mx-auto relative flex flex-col justify-center" style={{ minHeight: 380 }}>
        {/* Screen 0: Date & Time */}
        <div
          className={cn(
            "transition-all duration-500",
            screen === 0
              ? "opacity-100"
              : "opacity-0 absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none",
          )}
        >
          <div className="mb-5">
            <div className="text-[16px] font-semibold text-foreground">Book a Consultation</div>
            <div className="text-[13px] text-muted-foreground">30 min · Google Meet</div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[13px] font-semibold text-foreground">March 2026</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-[10px] font-medium text-muted-foreground text-center h-6 flex items-center justify-center">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {bookingCells.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} className="h-[30px]" />;
              const isWeekend = i % 7 === 0 || i % 7 === 6;
              const isPast = day < 18;
              const isSelected = day === 24 && phase >= 1;
              const isToday = day === 18;
              return (
                <div key={day} className="h-[30px] flex items-center justify-center">
                  <div className={cn(
                    "w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] transition-all duration-300",
                    isSelected
                      ? "bg-brand text-primary-foreground font-medium"
                      : isToday
                        ? "ring-1 ring-brand/30 text-brand font-medium"
                        : isPast
                          ? "text-muted-foreground/30"
                          : isWeekend
                            ? "text-muted-foreground/50"
                            : "text-foreground/80",
                  )}>
                    {day}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time slots */}
          <div className={cn(
            "transition-all duration-500 overflow-hidden",
            phase >= 2 ? "max-h-20 opacity-100 mt-4" : "max-h-0 opacity-0 mt-0",
          )}>
            <div className="flex gap-2">
              {["10:00 AM", "2:00 PM", "4:00 PM"].map((slot) => (
                <div key={slot} className={cn(
                  "h-[34px] flex-1 rounded-full border flex items-center justify-center text-[11px] font-medium transition-all duration-400",
                  phase >= 3 && slot === "2:00 PM"
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted-foreground",
                )}>
                  {slot}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Screen 1: Your Details */}
        <div
          className={cn(
            "transition-all duration-500",
            screen === 1
              ? "opacity-100"
              : screen < 1
                ? "opacity-0 translate-y-3 absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none"
                : "opacity-0 -translate-y-3 absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none",
          )}
        >
          <div className="mb-5">
            <div className="text-[16px] font-semibold text-foreground">Your Details</div>
            <div className="text-[13px] text-muted-foreground">Tue, Mar 24 at 2:00 PM · 30 min</div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Name</div>
              <div className={cn(
                "h-[36px] rounded-full border px-4 flex items-center text-[13px] transition-all duration-500",
                phase >= 5 ? "border-brand/30 text-foreground" : "border-border",
              )}>
                {phase >= 5 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">Sarah Johnson</span>}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Email</div>
              <div className={cn(
                "h-[36px] rounded-full border px-4 flex items-center text-[13px] transition-all duration-500",
                phase >= 6 ? "border-brand/30 text-foreground" : "border-border",
              )}>
                {phase >= 6 && <span className="animate-[messageIn_0.3s_ease-out_forwards]">sarah@company.com</span>}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Notes</div>
              <div className="h-[36px] rounded-full border border-border px-4 flex items-center text-[13px] text-muted-foreground/50">
                Optional...
              </div>
            </div>
          </div>
        </div>

        {/* Screen 2: Confirmation */}
        <div
          className={cn(
            "transition-all duration-500",
            screen === 2
              ? "opacity-100"
              : "opacity-0 scale-95 absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none",
          )}
        >
          <div className="flex flex-col items-center py-10">
            <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center mb-3 animate-[messageIn_0.3s_ease-out_forwards]">
              <Check className="w-7 h-7 text-brand" />
            </div>
            <div className="text-[16px] font-semibold text-foreground">
              Booking confirmed!
            </div>
            <div className="text-[13px] text-muted-foreground mt-1">
              Tue, Mar 24 at 2:00 PM · 30 min
            </div>
            <div className="text-[12px] text-muted-foreground/70 mt-0.5">
              Confirmation sent to sarah@company.com
            </div>
          </div>
        </div>
      </div>

      {/* Pagination + Button */}
      <div className="max-w-[360px] mx-auto mt-5">
        <div className="flex gap-1.5 mb-3">
          {bars.map((bg, i) => (
            <div key={i} className={cn("h-[3px] flex-1 rounded-full transition-all duration-500", bg)} />
          ))}
        </div>
        <div
          className={cn(
            "h-[36px] rounded-full flex items-center justify-center text-[12px] font-medium transition-all duration-500",
            screen === 2
              ? "bg-brand/10 text-brand"
              : (phase === 4 || phase === 7)
                ? "bg-brand text-primary-foreground"
                : "bg-muted text-muted-foreground/50",
          )}
        >
          {screen === 2 ? "Done" : screen === 1 ? "Confirm" : "Next"}
        </div>
      </div>
    </div>
  );
}

/* ─── Mock Contact CRM UI ─────────────────────────────────────────────────── */

function MockContactCrmUI() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 1200);
    t(() => setPhase(2), 2200);
    t(() => setPhase(3), 3400);
    t(() => setPhase(4), 4600);
    t(() => setPhase(0), 7000);

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card-glow-secondary p-6 rounded-[20px] min-h-[320px]">
      {/* Window dots */}
      <div className="flex items-center gap-1.5 mb-5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        <span className="text-[11px] text-muted-foreground ml-2">
          Contact Details
        </span>
      </div>

      {/* Contact card */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-sm font-semibold text-brand">
          SJ
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            Sarah Johnson
          </div>
          <div className="text-xs text-muted-foreground">
            sarah@company.com
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 mb-5 min-h-[28px]">
        <div
          className={cn(
            "transition-all duration-500",
            phase >= 1
              ? "opacity-100 scale-100"
              : "opacity-0 scale-75",
          )}
        >
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/15">
            <Star className="w-3 h-3" />
            VIP
          </span>
        </div>
        <div
          className={cn(
            "transition-all duration-500",
            phase >= 2
              ? "opacity-100 scale-100"
              : "opacity-0 scale-75",
          )}
        >
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-brand/10 text-brand border border-brand/15">
            <Zap className="w-3 h-3" />
            Active Lead
          </span>
        </div>
      </div>

      {/* Activity timeline */}
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Activity
      </div>
      <div className="space-y-0">
        <div
          className={cn(
            "transition-all duration-500 overflow-hidden",
            phase >= 3
              ? "max-h-20 opacity-100"
              : "max-h-0 opacity-0",
          )}
        >
          <div className="flex items-start gap-3 pb-3 animate-[fadeSlideIn_0.3s_ease-out_forwards]">
            <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
            <div>
              <div className="text-xs text-foreground font-medium">
                Booked consultation
              </div>
              <div className="text-[11px] text-muted-foreground">2h ago</div>
            </div>
          </div>
        </div>
        <div
          className={cn(
            "transition-all duration-500 overflow-hidden",
            phase >= 4
              ? "max-h-20 opacity-100"
              : "max-h-0 opacity-0",
          )}
        >
          <div className="flex items-start gap-3 pb-3 animate-[fadeSlideIn_0.3s_ease-out_forwards]">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-soft/50 mt-1.5 shrink-0" />
            <div>
              <div className="text-xs text-foreground font-medium">
                Submitted contact form
              </div>
              <div className="text-[11px] text-muted-foreground">1d ago</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock API UI ─────────────────────────────────────────────────────────── */

function MockApiUI() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 1000);
    t(() => setPhase(2), 2200);
    t(() => setPhase(3), 4200);
    t(() => setPhase(4), 5400);
    t(() => setPhase(0), 8000);

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card-glow-secondary p-5 rounded-[20px]">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        <span className="text-[11px] text-muted-foreground ml-2">
          Terminal
        </span>
      </div>

      <div className="bg-[#0f1a14] rounded-xl p-4 font-mono text-xs space-y-3 min-h-[260px]">
        {/* Request 1 */}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-green-400/80">$</span>
            <span className="text-[#a8d8b9]">curl</span>
            <span className="text-[#81c995]">GET</span>
            <span className="text-[#d4e8dc] break-all">
              /api/v1/availability/acme
            </span>
          </div>
        </div>

        {/* Spinner */}
        <div
          className={cn(
            "transition-all duration-300",
            phase === 1 ? "opacity-100" : "opacity-0 h-0",
          )}
        >
          <div className="flex items-center gap-2 text-[#5c7268]">
            <div className="flex gap-1">
              <span className="animate-[typingDot_1.4s_ease-in-out_infinite]">
                .
              </span>
              <span className="animate-[typingDot_1.4s_ease-in-out_infinite_0.2s]">
                .
              </span>
              <span className="animate-[typingDot_1.4s_ease-in-out_infinite_0.4s]">
                .
              </span>
            </div>
            <span>fetching</span>
          </div>
        </div>

        {/* Response 1 */}
        <div
          className={cn(
            "transition-all duration-500",
            phase >= 2 ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="text-green-400/70 text-[10px] mb-1">
            200 OK
          </div>
          <pre className="text-[#d4e8dc] text-[11px] leading-relaxed">
            {`{
  `}
            <span className="text-[#7ec8a0]">"slots"</span>
            {`: [`}
            {`
    { `}
            <span className="text-[#7ec8a0]">"start"</span>
            {`: `}
            <span className="text-[#a8d8b9]">"2026-03-24T14:00"</span>
            {` },`}
            {`
    { `}
            <span className="text-[#7ec8a0]">"start"</span>
            {`: `}
            <span className="text-[#a8d8b9]">"2026-03-24T15:00"</span>
            {` }`}
            {`
  ]
}`}
          </pre>
        </div>

        {/* Request 2 */}
        <div
          className={cn(
            "transition-all duration-500",
            phase >= 3 ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="flex items-center gap-2 border-t border-[#1a2e23] pt-3">
            <span className="text-green-400/80">$</span>
            <span className="text-[#a8d8b9]">curl</span>
            <span className="text-[#81c995]">POST</span>
            <span className="text-[#d4e8dc]">/api/v1/bookings</span>
          </div>
        </div>

        {/* Response 2 */}
        <div
          className={cn(
            "transition-all duration-500",
            phase >= 4 ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="text-green-400/70 text-[10px] mb-1">
            201 Created
          </div>
          <pre className="text-[#d4e8dc] text-[11px] leading-relaxed">
            {`{
  `}
            <span className="text-[#7ec8a0]">"id"</span>
            {`: `}
            <span className="text-[#a8d8b9]">"bk_a1b2c3d4"</span>
            {`,
  `}
            <span className="text-[#7ec8a0]">"status"</span>
            {`: `}
            <span className="text-[#a8d8b9]">"confirmed"</span>
            {`
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock Workflow UI ────────────────────────────────────────────────────── */

function MockWorkflowUI() {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    t(() => setPhase(1), 1200);
    t(() => setPhase(2), 2400);
    t(() => setPhase(3), 3600);
    t(() => setPhase(4), 4800);
    t(() => setPhase(0), 7000);

    return () => timersRef.current.forEach(clearTimeout);
  }, [phase === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = [
    {
      icon: Send,
      label: "Send confirmation email",
      sub: "via Resend",
      minPhase: 1,
    },
    {
      icon: Tag,
      label: "Add tag 'Lead'",
      sub: "auto-tag",
      minPhase: 2,
    },
    {
      icon: Clock,
      label: "Wait 2 days",
      sub: "delay step",
      minPhase: 3,
    },
    {
      icon: Send,
      label: "Send follow-up email",
      sub: "via Resend",
      minPhase: 4,
    },
  ];

  return (
    <div className="card-glow-secondary p-6 rounded-[20px]">
      {/* Window dots */}
      <div className="flex items-center gap-1.5 mb-5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        <span className="text-[11px] text-muted-foreground ml-2">
          Workflow Editor
        </span>
      </div>

      {/* Trigger */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-brand/15 bg-brand/5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
          <Zap className="w-4 h-4 text-brand" />
        </div>
        <div>
          <div className="text-xs font-semibold text-foreground">
            Form Submitted
          </div>
          <div className="text-[10px] text-muted-foreground">Trigger</div>
        </div>
      </div>

      {/* Steps */}
      {steps.map((step, i) => (
        <div key={i}>
          {/* Connector arrow */}
          <div className="flex justify-center py-1">
            <div
              className={cn(
                "w-0.5 h-5 rounded-full transition-all duration-500",
                phase >= step.minPhase ? "bg-brand/30" : "bg-border",
              )}
            />
          </div>

          {/* Step card */}
          <div
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border transition-all duration-500",
              phase >= step.minPhase
                ? "border-brand/15 bg-brand/[0.03]"
                : "border-border bg-muted/20",
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500",
                phase >= step.minPhase ? "bg-brand/10" : "bg-muted",
              )}
            >
              <step.icon
                className={cn(
                  "w-4 h-4 transition-all duration-500",
                  phase >= step.minPhase
                    ? "text-brand"
                    : "text-muted-foreground",
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground">
                {step.label}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {step.sub}
              </div>
            </div>
            <div
              className={cn(
                "transition-all duration-500",
                phase >= step.minPhase
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-50",
              )}
            >
              <Check className="w-4 h-4 text-brand" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── FAQ Item ────────────────────────────────────────────────────────────── */

interface FaqItemData {
  question: string;
  answer: string;
}

function FaqItem({ question, answer }: FaqItemData) {
  const [open, setOpen] = useState(false);

  return (
    <div className="landing-scene-panel px-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-5 text-left group"
      >
        <span className="text-[15px] font-normal text-foreground group-hover:text-brand transition-colors pr-4">
          {question}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <p className="text-sm text-muted-foreground leading-relaxed pb-5">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ Data ────────────────────────────────────────────────────────────── */

const faqItems: FaqItemData[] = [
  {
    question: "What types of forms can I build?",
    answer:
      "LinkyCal supports multi-step forms with conditional logic, 12+ field types including text, email, phone, select, date, file upload, and more. You can create complex branching flows where fields appear or hide based on previous answers, and validate submissions in real-time.",
  },
  {
    question: "How does the booking system work?",
    answer:
      "You create event types with customizable durations, availability schedules, and buffer times. Share your booking link and visitors pick a time that works. If you connect Google Calendar, availability is synced automatically. Everything is timezone-aware, and confirmation emails are sent instantly.",
  },
  {
    question: "Can I embed widgets on my website?",
    answer:
      "Yes! Add a single script tag to your website and initialize the booking or form widget with one line of JavaScript. The widgets are self-contained with zero external dependencies, fully customizable themes, and work on any website — including WordPress, Webflow, and static HTML.",
  },
  {
    question: "Is there an API?",
    answer:
      "Every feature in LinkyCal is available through our REST API. Authenticate with an API key, then check availability, create bookings, submit form responses, manage contacts, and more — all programmatically. Full OpenAPI documentation is included.",
  },
  {
    question: "What's included in the free plan?",
    answer:
      "The free plan includes 1 project, 3 forms, 3 event types, 100 contacts, and 1 workflow. It's a great way to try LinkyCal for personal projects or small-scale use. Upgrade to Pro or Business when you need more capacity, calendar sync, or API access.",
  },
  {
    question: "Can I migrate from Calendly or Typeform?",
    answer:
      "Yes. You can import contacts via CSV for bulk migration, and our API allows programmatic migration of forms, event types, and contact data. If you need help with a large migration, our support team is available to assist.",
  },
];

interface LandingSceneSectionProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  fullHeight?: boolean;
  id?: string;
}

interface FeatureShowcaseCapability {
  title: string;
  description: string;
}

interface FeatureShowcaseItem {
  id: string;
  railLabel: string;
  eyebrow: string;
  title: string;
  highlightedTitle?: string;
  description: string;
  capabilities: FeatureShowcaseCapability[];
  DemoComponent: () => ReactNode;
}

function LandingSceneBackground() {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-95 pointer-events-none"
        style={{ backgroundImage: "url('/bg-image.webp')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.78) 0%, rgba(248, 252, 249, 0.74) 26%, rgba(244, 250, 246, 0.7) 55%, rgba(249, 252, 250, 0.78) 100%)",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(255, 255, 255, 0.44), transparent 34%), radial-gradient(circle at 80% 18%, rgba(45, 106, 79, 0.18), transparent 30%), radial-gradient(circle at 50% 85%, rgba(27, 67, 50, 0.12), transparent 38%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute top-[8%] -left-32 h-[28rem] w-[28rem] rounded-full bg-brand/[0.08] blur-[140px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute top-[32%] right-[-8rem] h-[24rem] w-[24rem] rounded-full bg-brand-dark/[0.08] blur-[130px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[6%] left-[18%] h-[22rem] w-[22rem] rounded-full bg-white/40 blur-[120px] pointer-events-none"
      />
    </>
  );
}

function LandingSceneSection({
  children,
  className,
  contentClassName,
  fullHeight = true,
  id,
}: LandingSceneSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative py-24",
        fullHeight && "min-h-screen flex items-center",
        className,
      )}
    >
      <div className={cn("max-w-7xl mx-auto px-6 w-full", contentClassName)}>
        {children}
      </div>
    </section>
  );
}

const featureShowcaseItems: FeatureShowcaseItem[] = [
  {
    id: "feature-scheduling",
    railLabel: "Scheduling",
    eyebrow: "Scheduling",
    title: "Schedule without the back-and-forth.",
    description:
      "Share booking pages and widgets that stay in sync with your calendar, handle timezones correctly, and confirm every slot the moment it is reserved.",
    capabilities: [
      {
        title: "Google Calendar sync",
        description:
          "Block busy time automatically and surface live availability.",
      },
      {
        title: "Buffer times",
        description:
          "Add breathing room before and after meetings without manual cleanup.",
      },
      {
        title: "Timezone aware",
        description:
          "Show the right local slot for every visitor without confusion.",
      },
      {
        title: "Confirmation emails",
        description:
          "Send booking details instantly once a slot is locked in.",
      },
    ],
    DemoComponent: MockBookingUI,
  },
  {
    id: "feature-forms",
    railLabel: "Forms",
    eyebrow: "Forms",
    title: "Build forms that adapt.",
    description:
      "Create multi-step flows that branch based on answers, collect files, and validate the right fields before anything gets submitted.",
    capabilities: [
      {
        title: "Conditional logic",
        description:
          "Reveal the next question from what the visitor already told you.",
      },
      {
        title: "File uploads",
        description:
          "Collect briefs, assets, and supporting documents in the same flow.",
      },
      {
        title: "Multi-step",
        description:
          "Break longer forms into short screens that are easier to finish.",
      },
      {
        title: "Validation",
        description:
          "Catch missing or malformed inputs before the response is stored.",
      },
    ],
    DemoComponent: MockFormBuilderUI,
  },
  {
    id: "feature-contacts",
    railLabel: "Contacts",
    eyebrow: "Contacts",
    title: "Keep every contact organized.",
    description:
      "Turn every form response and booking into a contact record with tags, history, and enough context for your team to act immediately.",
    capabilities: [
      {
        title: "Auto-tagging",
        description:
          "Apply tags from answers, event type, or workflow branch automatically.",
      },
      {
        title: "Activity timeline",
        description:
          "See submissions, bookings, and follow-up actions in one stream.",
      },
      {
        title: "CSV import",
        description:
          "Bring existing contacts in without rebuilding your data manually.",
      },
      {
        title: "Smart search",
        description:
          "Filter people by tag, source, or recent activity in seconds.",
      },
    ],
    DemoComponent: MockContactCrmUI,
  },
  {
    id: "feature-workflows",
    railLabel: "Workflows",
    eyebrow: "Workflows",
    title: "Automate the busywork.",
    description:
      "Trigger follow-ups from submissions and bookings, branch logic based on context, and keep repetitive post-submit tasks off your plate.",
    capabilities: [
      {
        title: "Email triggers",
        description:
          "Send confirmations, reminders, and follow-ups from one event.",
      },
      {
        title: "Tag automation",
        description:
          "Segment leads automatically as new activity comes in.",
      },
      {
        title: "Webhooks",
        description:
          "Push bookings and submissions into the tools you already use.",
      },
      {
        title: "Conditional logic",
        description:
          "Branch actions based on answers, timing, or event details.",
      },
    ],
    DemoComponent: MockWorkflowUI,
  },
  {
    id: "feature-api",
    railLabel: "API",
    eyebrow: "API",
    title: "Let your agents",
    highlightedTitle: "handle everything.",
    description:
      "Expose the same scheduling, forms, and contact workflows through an API so custom apps and AI agents can do the work programmatically.",
    capabilities: [
      {
        title: "Check availability",
        description:
          "Query live scheduling windows before you show the next step.",
      },
      {
        title: "Create bookings",
        description:
          "Reserve slots directly from agents or custom application flows.",
      },
      {
        title: "Submit forms",
        description:
          "Post structured responses into your workflows without the widget.",
      },
      {
        title: "Manage contacts",
        description:
          "Read and update people records while your agents operate.",
      },
    ],
    DemoComponent: MockApiUI,
  },
];

interface FeatureShowcasePanelProps {
  item: FeatureShowcaseItem;
  index: number;
  total: number;
}

function FeatureShowcasePanel({
  item,
  index,
  total,
}: FeatureShowcasePanelProps) {
  const DemoComponent = item.DemoComponent;
  const step = String(index + 1).padStart(2, "0");
  const totalSteps = String(total).padStart(2, "0");
  const progressWidth = `${((index + 1) / total) * 100}%`;

  return (
    <article
      id={item.id}
      className="feature-editorial-panel scroll-mt-32 p-5 sm:p-7 lg:p-8"
    >
      <div className="flex items-center gap-4 mb-7">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-brand" />
          <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            {item.eyebrow}
          </span>
        </div>
        <div className="relative h-px flex-1 bg-brand/12 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-brand"
            style={{ width: progressWidth }}
          />
        </div>
        <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
          {step}/{totalSteps}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {item.capabilities.map((capability, capabilityIndex) => (
          <div
            key={capability.title}
            className="rounded-[20px] border border-brand/10 bg-white/45 px-4 pt-4 pb-5 backdrop-blur-xl min-h-[112px]"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums mb-3">
              {String(capabilityIndex + 1).padStart(2, "0")}
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              {capability.title}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {capability.description}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)] gap-8 xl:gap-10 items-start border-t border-brand/12 pt-8">
        <div className="space-y-7">
          <h2 className="max-w-4xl text-[2.75rem] sm:text-[3.35rem] lg:text-[4.15rem] font-medium tracking-tight leading-[0.94] text-foreground">
            {item.title}{" "}
            {item.highlightedTitle && (
              <span className="text-brand">{item.highlightedTitle}</span>
            )}
          </h2>

          <div className="max-w-2xl">
            <p className="text-base leading-relaxed text-muted-foreground">
              {item.description}
            </p>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-foreground hover:text-brand transition-colors"
            >
              View documentation
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="xl:pl-2">
          <DemoComponent />
        </div>
      </div>
    </article>
  );
}

/* ─── Landing Page ────────────────────────────────────────────────────────── */

export default function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showAuth = searchParams.get("show_auth") === "true";
  const [authOpen, setAuthOpen] = useState(showAuth);
  const [loading, setLoading] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<"social" | "otp">("social");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpValues, setOtpValues] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [activeFeatureShowcase, setActiveFeatureShowcase] = useState(
    featureShowcaseItems[0].id,
  );
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setAuthOpen(showAuth);
  }, [showAuth]);

  useEffect(() => {
    const panels = featureShowcaseItems
      .map((item) => document.getElementById(item.id))
      .filter((panel): panel is HTMLElement => panel instanceof HTMLElement);

    if (!panels.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveFeatureShowcase(visibleEntry.target.id);
        }
      },
      {
        rootMargin: "-18% 0px -55% 0px",
        threshold: [0.18, 0.35, 0.55, 0.75],
      },
    );

    panels.forEach((panel) => observer.observe(panel));

    return () => observer.disconnect();
  }, []);

  const handleClose = useCallback(() => {
    setAuthOpen(false);
    setAuthStep("social");
    setOtpEmail("");
    setOtpValues(Array(6).fill(""));
    setOtpError(null);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const openAuth = useCallback(() => {
    setAuthOpen(true);
    setSearchParams({ show_auth: "true" }, { replace: true });
  }, [setSearchParams]);

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
      window.location.href = "/app";
    } catch {
      setOtpError("Verification failed. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
      {/* ── 1. Floating Header ──────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 px-4">
        <nav className="bg-white/50 backdrop-blur-2xl rounded-2xl md:rounded-full px-2 py-1.5 w-full md:w-auto flex items-center gap-1">
          <Link to="/" className="px-2">
            <Logo size="md" />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center">
            <a
              href="#features"
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </a>
            <Link
              to="/docs"
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Docs
            </Link>
          </div>

          {/* Spacer */}
          <div className="flex-1 md:w-16 md:flex-none" />

          {/* CTA */}
          <button
            onClick={openAuth}
            className="glow-surface rounded-full h-9 px-5 text-sm font-medium whitespace-nowrap"
          >
            Get Started
          </button>
        </nav>
      </header>

      {/* ── 2. Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative isolate pt-28 pb-20 overflow-hidden"
        style={{
          backgroundImage: "url('/bg-image.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.34) 48%, rgba(255,255,255,0) 100%)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            maskImage:
              "linear-gradient(135deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 18%, rgba(0,0,0,0.74) 40%, rgba(0,0,0,0.38) 64%, rgba(0,0,0,0.12) 82%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(135deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 18%, rgba(0,0,0,0.74) 40%, rgba(0,0,0,0.38) 64%, rgba(0,0,0,0.12) 82%, transparent 100%)",
          }}
        />
        {/* Background glow orbs */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-brand/[0.04] rounded-full blur-[120px] animate-[glowPulse_6s_ease-in-out_infinite] pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-brand-dark/[0.03] rounded-full blur-[100px] animate-[glowPulse_8s_ease-in-out_infinite_2s] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative pt-20">
          {/* Top: headline + description + CTAs */}
          <div className="max-w-4xl">
            <h1 className="text-[2.75rem] sm:text-[3.5rem] lg:text-[4.5rem] font-medium tracking-tight leading-[1.06]">
              Scheduling and Forms for <span className="text-brand">your business</span> and <span className="text-brand">AI agents</span>
            </h1>
            <p className="text-lg text-brand font-medium text-shadow-md max-w-xl leading-relaxed mt-6 mb-10">
              Multi-step forms, calendar booking links, contact management, and
              embeddable widgets. Embed on your site or integrate with AI agents
              through a simple API.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={openAuth}
                className="glow-surface rounded-full h-12 px-8 text-sm font-medium inline-flex items-center justify-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                to="/docs"
                className="glow-surface-subtle rounded-full h-12 px-6 text-sm font-medium inline-flex items-center justify-center text-foreground"
              >
                View Documentation
              </Link>
            </div>
            <div className="flex items-center gap-6 mt-6 text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-brand" />
                Start for free
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-brand" />
                Setup in minutes
              </span>
            </div>
          </div>

          {/* Two hero cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-14 max-w-5xl mr-auto">
            <HeroWebsiteCard />
            <HeroAgentChat />
          </div>
        </div>
      </section>

      <div className="relative isolate">
        <LandingSceneBackground />

        {/* ── 3. Feature Bento Grid ─────────────────────────────────────── */}
        <LandingSceneSection id="features">
          <div className="mb-12">
            <div className="text-sm font-medium text-brand uppercase tracking-wider mb-3">
              Features
            </div>
            <h2 className="text-3xl sm:text-[2.5rem] font-medium tracking-tight leading-tight max-w-2xl">
              Headless and branded forms and Scheduling infrastructure
            </h2>
          </div>

          <div className="landing-scene-panel p-6 sm:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left — Tall animated multi-step form card */}
              <BentoMultiStepForm />

              {/* Right — Stacked cards */}
              {/* Embed */}
              <div className="card-glow-secondary p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
                    <Code2 className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      One-line embed
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Add forms and booking to any website
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#0f1a14] p-4">
                  <div className="flex items-center gap-[5px] mb-2.5">
                    <div className="w-[7px] h-[7px] rounded-full bg-[#EC6A5E]/60" />
                    <div className="w-[7px] h-[7px] rounded-full bg-[#F5BF4F]/60" />
                    <div className="w-[7px] h-[7px] rounded-full bg-[#61C554]/60" />
                  </div>
                  <code className="text-[11px] text-[#d4e8dc] leading-relaxed block">
                    <span className="text-[#81c995]">&lt;script</span>{" "}
                    <span className="text-[#7ec8a0]">src</span>=
                    <span className="text-[#a8d8b9]">
                      "https://cdn.linkycal.com/widgets/booking.js"
                    </span>
                    <span className="text-[#81c995]">&gt;&lt;/script&gt;</span>
                    {"\n"}
                    <span className="text-[#81c995]">&lt;script&gt;</span>
                    <span className="text-[#d4e8dc]">
                      LinkyCal.booking({"{"}{" "}
                    </span>
                    <span className="text-[#7ec8a0]">projectSlug</span>:{" "}
                    <span className="text-[#a8d8b9]">"acme"</span>
                    <span className="text-[#d4e8dc]"> {"}"})</span>
                    <span className="text-[#81c995]">&lt;/script&gt;</span>
                  </code>
                </div>
              </div>

              {/* Customization */}
              <div className="card-glow-secondary p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
                    <Palette className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Full customization
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Match your brand perfectly
                    </p>
                  </div>
                </div>
                {/* Color palette row */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex gap-2">
                    {[
                      { bg: "bg-brand", ring: true },
                      { bg: "bg-[#3B82F6]", ring: false },
                      { bg: "bg-[#8B5CF6]", ring: false },
                      { bg: "bg-[#F97316]", ring: false },
                    ].map((c, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-6 h-6 rounded-full",
                          c.bg,
                          c.ring && "ring-2 ring-brand/30 ring-offset-2",
                        )}
                      />
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Satoshi</span>
                    <span>·</span>
                    <span className="font-medium text-foreground">Round</span>
                  </div>
                </div>
              </div>

              {/* Calendar integration — weekly availability */}
              <div className="card-glow-secondary p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
                    <CalendarCheck className="w-4 h-4 text-brand" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Calendar integration
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Sync availability in real-time
                    </p>
                  </div>
                  {/* Google Calendar logo */}
                  <svg className="w-7 h-7 shrink-0" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="18" rx="3" fill="#fff" stroke="#E0E0E0" strokeWidth="1" />
                    <rect x="3" y="4" width="18" height="6" rx="3" fill="#4285F4" />
                    <path d="M8 2.5v3M16 2.5v3" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
                    <text x="12" y="18.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#4285F4">31</text>
                  </svg>
                </div>
                <div className="space-y-[6px]">
                  {[
                    { day: "Mon", hours: "9:00 AM — 5:00 PM", faded: false },
                    { day: "Tue", hours: "9:00 AM — 5:00 PM", faded: false },
                    { day: "Wed", hours: "9:00 AM — 1:00 PM", faded: true },
                  ].map((row) => (
                    <div key={row.day} className={cn("flex items-center gap-2.5", row.faded && "opacity-30")}>
                      <div className="w-[6px] h-[6px] rounded-full bg-brand" />
                      <span className="text-[11px] w-7 font-medium text-foreground">
                        {row.day}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {row.hours}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact CRM */}
              <div className="card-glow-secondary p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Contacts CRM
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Organize every interaction
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    {
                      initial: "S",
                      color: "bg-[#1B4332]/10 text-brand",
                      name: "Sarah Johnson",
                      email: "sarah@acme.com",
                      badges: [
                        { label: "Pro", dot: "bg-[#3B82F6]", bg: "bg-[#3B82F6]/8" },
                        { label: "Partner", dot: "bg-brand", bg: "bg-brand/8" },
                      ],
                    },
                    {
                      initial: "A",
                      color: "bg-[#3B82F6]/10 text-[#3B82F6]",
                      name: "Alex Martinez",
                      email: "alex@startup.io",
                      badges: [
                        { label: "Contacted", dot: "bg-[#F59E0B]", bg: "bg-[#F59E0B]/8" },
                      ],
                    },
                    {
                      initial: "J",
                      color: "bg-[#8B5CF6]/10 text-[#8B5CF6]",
                      name: "Jordan Kim",
                      email: "jordan@agency.co",
                      badges: [
                        { label: "Lead", dot: "bg-[#8B5CF6]", bg: "bg-[#8B5CF6]/8" },
                        { label: "VIP", dot: "bg-[#F97316]", bg: "bg-[#F97316]/8" },
                      ],
                    },
                  ].map((contact) => (
                    <div key={contact.name} className="flex items-start gap-2.5">
                      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0", contact.color)}>
                        {contact.initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-foreground leading-tight">{contact.name}</div>
                        <div className="text-[10px] text-muted-foreground leading-tight mt-px">{contact.email}</div>
                        <div className="flex gap-1 mt-1">
                          {contact.badges.map((b) => (
                            <span key={b.label} className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[8px] font-medium text-foreground", b.bg)}>
                              <span className={cn("w-[4px] h-[4px] rounded-full", b.dot)} />
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workflow automation — vertical flow */}
              <div className="card-glow-secondary p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-sm bg-brand/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Workflow automation
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Automate repetitive tasks
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  {/* Trigger node */}
                  <div className="w-full flex items-center gap-2.5 bg-brand/5 rounded-sm px-3 py-2">
                    <div className="w-7 h-7 rounded-[8px] bg-brand/10 flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5 text-brand" />
                    </div>
                    <div>
                      <div className="text-[9px] text-brand font-medium leading-none">Trigger</div>
                      <div className="text-[11px] font-medium text-foreground leading-tight mt-px">Form submitted</div>
                    </div>
                  </div>
                  {/* Connector */}
                  <div className="w-px h-4 bg-border" />
                  {/* Step 1 */}
                  <div className="w-full flex items-center gap-2.5 bg-muted rounded-sm px-3 py-2">
                    <div className="w-7 h-7 rounded-[8px] bg-white flex items-center justify-center shrink-0">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-[11px] font-medium text-foreground">Send confirmation email</span>
                  </div>
                  {/* Connector */}
                  <div className="w-px h-4 bg-border" />
                  {/* Step 2 */}
                  <div className="w-full flex items-center gap-2.5 bg-muted rounded-sm px-3 py-2">
                    <div className="w-7 h-7 rounded-[8px] bg-white flex items-center justify-center shrink-0">
                      <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-[11px] font-medium text-foreground">Add &ldquo;Lead&rdquo; tag</span>
                  </div>
                  {/* Connector */}
                  <div className="w-px h-4 bg-border" />
                  {/* Step 3 */}
                  <div className="w-full flex items-center gap-2.5 bg-muted rounded-sm px-3 py-2">
                    <div className="w-7 h-7 rounded-[8px] bg-white flex items-center justify-center shrink-0">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-[11px] font-medium text-foreground">Notify via webhook</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </LandingSceneSection>

        <LandingSceneSection
          id="feature-showcase"
          fullHeight={false}
          contentClassName="max-w-[90rem]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-6 lg:gap-8">
            <aside className="lg:w-60 shrink-0 lg:self-start lg:sticky lg:top-28">
              <div className="feature-showcase-rail">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/70 mb-4">
                  Product Surface
                </div>

                <div className="lg:hidden -mx-1 overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2 px-1">
                    {featureShowcaseItems.map((item, index) => {
                      const isActive = activeFeatureShowcase === item.id;
                      return (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          onClick={() => setActiveFeatureShowcase(item.id)}
                          className={cn(
                            "rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.24em] transition-colors whitespace-nowrap",
                            isActive
                              ? "border-brand-soft/30 bg-brand-soft/20 text-white"
                              : "border-white/10 text-white/65 hover:text-white hover:border-white/20",
                          )}
                        >
                          {String(index + 1).padStart(2, "0")} {item.railLabel}
                        </a>
                      );
                    })}
                  </div>
                </div>

                <div className="hidden lg:block space-y-1.5">
                  {featureShowcaseItems.map((item, index) => {
                    const isActive = activeFeatureShowcase === item.id;

                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        onClick={() => setActiveFeatureShowcase(item.id)}
                        className={cn(
                          "group block rounded-2xl px-3 py-3 transition-colors",
                          isActive && "bg-white/6",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "text-[11px] uppercase tracking-[0.24em] tabular-nums transition-colors",
                              isActive ? "text-white" : "text-white/45",
                            )}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] uppercase tracking-[0.24em] transition-colors",
                              isActive ? "text-white" : "text-white/62 group-hover:text-white/88",
                            )}
                          >
                            {item.railLabel}
                          </span>
                        </div>
                        <div className="mt-2 h-px bg-white/10 overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-300",
                              isActive ? "w-full bg-brand-soft" : "w-0 bg-white/35 group-hover:w-14",
                            )}
                          />
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="flex-1 space-y-8 lg:space-y-10">
              {featureShowcaseItems.map((item, index) => (
                <FeatureShowcasePanel
                  key={item.id}
                  item={item}
                  index={index}
                  total={featureShowcaseItems.length}
                />
              ))}
            </div>
          </div>
        </LandingSceneSection>

        {/* ── 10. How It Works ──────────────────────────────────────────── */}
        <LandingSceneSection id="how-it-works">
          <div className="landing-scene-panel p-6 sm:p-8 lg:p-10">
            <div className="text-center mb-14">
              <div className="text-sm font-medium text-brand uppercase tracking-wider mb-3">
                How It Works
              </div>
              <h2 className="text-3xl sm:text-[2.5rem] font-medium tracking-tight leading-tight">
                Up and running in three steps
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <div className="card-glow-secondary p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-semibold">
                    1
                  </div>
                  <Terminal className="w-5 h-5 text-brand" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">
                  Create your project
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Pick a name and slug for your project. This becomes your
                  namespace for forms, events, and contacts.
                </p>
                <div className="rounded-xl border border-border bg-white p-3 space-y-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">
                      Project name
                    </div>
                    <div className="h-7 rounded-lg border border-border px-2 flex items-center text-xs text-foreground">
                      Acme Corp
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">
                      Slug
                    </div>
                    <div className="h-7 rounded-lg border border-border px-2 flex items-center text-xs text-muted-foreground">
                      acme-corp
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="card-glow-secondary p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-semibold">
                    2
                  </div>
                  <FileText className="w-5 h-5 text-brand" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">
                  Build forms &amp; event types
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Add fields to your forms, set up event types with availability
                  rules, and configure your booking page.
                </p>
                <div className="rounded-xl border border-border bg-white p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-[10px] font-medium text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                      Fields
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {["Name", "Email", "Date", "Message"].map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-2 text-[11px] text-foreground bg-muted/30 rounded-lg px-2.5 py-1.5"
                      >
                        <div className="w-1 h-3 rounded-full bg-brand/30" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="card-glow-secondary p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-semibold">
                    3
                  </div>
                  <Code2 className="w-5 h-5 text-brand" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">
                  Embed &amp; go live
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Copy the script tag, paste it into your website, and your forms
                  and booking widgets are live.
                </p>
                <div className="rounded-xl bg-[#0f1a14] p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-red-400/50" />
                    <div className="w-2 h-2 rounded-full bg-yellow-400/50" />
                    <div className="w-2 h-2 rounded-full bg-green-400/50" />
                  </div>
                  <code className="text-[10px] text-[#d4e8dc] leading-relaxed block">
                    <span className="text-[#81c995]">&lt;script</span>{" "}
                    <span className="text-[#7ec8a0]">src</span>=
                    <span className="text-[#a8d8b9]">"...booking.js"</span>
                    <span className="text-[#81c995]">&gt;</span>
                    {"\n"}
                    <span className="text-[#81c995]">&lt;/script&gt;</span>
                  </code>
                </div>
              </div>
            </div>
          </div>
        </LandingSceneSection>

        {/* ── 11. Pricing ───────────────────────────────────────────────── */}
        <LandingSceneSection id="pricing">
          <div className="landing-scene-panel p-6 sm:p-8 lg:p-10">
            <div className="text-center mb-12">
              <div className="text-sm font-medium text-brand uppercase tracking-wider mb-3">
                Pricing
              </div>
              <h2 className="text-3xl sm:text-[2.5rem] font-medium tracking-tight leading-tight">
                ... And it does not cost arm and a leg
              </h2>
            </div>
            <PricingCards onGetStarted={openAuth} />
          </div>
        </LandingSceneSection>

        {/* ── 12. FAQ ───────────────────────────────────────────────────── */}
        <LandingSceneSection id="faq" fullHeight={false} contentClassName="max-w-3xl">
          <div className="landing-scene-panel p-6 sm:p-8 lg:p-10">
            <div className="text-center mb-12">
              <div className="text-sm font-medium text-brand uppercase tracking-wider mb-3">
                FAQ
              </div>
              <h2 className="text-3xl sm:text-[2.5rem] font-medium tracking-tight leading-tight">
                Frequently asked questions
              </h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <FaqItem key={item.question} {...item} />
              ))}
            </div>
          </div>
        </LandingSceneSection>

        {/* ── 13. Final CTA ─────────────────────────────────────────────── */}
        <LandingSceneSection fullHeight={false} contentClassName="max-w-5xl">
          <div className="landing-scene-panel text-center px-6 py-10 sm:px-8 sm:py-12">
            <h2 className="text-3xl sm:text-[2.5rem] font-medium tracking-tight leading-tight mb-5">
              Ready to get started?
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed mb-8 max-w-xl mx-auto">
              Create your free account and build your first form or booking page
              in minutes. No credit card required.
            </p>
            <button
              onClick={openAuth}
              className="glow-surface rounded-full h-12 px-8 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </LandingSceneSection>

        {/* ── 14. Footer ────────────────────────────────────────────────── */}
        <footer className="relative pb-8 px-6">
          <div className="landing-scene-panel max-w-7xl mx-auto p-10">
            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-10">
              {/* Brand */}
              <div>
                <Logo size="md" />
                <p className="text-sm text-muted-foreground leading-relaxed mt-4 max-w-xs">
                  Form and Scheduling infrastructure for modern teams. Multi-step
                  forms, calendar scheduling, contact management, and embeddable
                  widgets — all API-first.
                </p>
                <div className="flex items-center gap-3 mt-5">
                  {/* Twitter/X */}
                  <a
                    href="https://twitter.com/linkycal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  {/* LinkedIn */}
                  <a
                    href="https://linkedin.com/company/linkycal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Pages */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-4">
                  Pages
                </h4>
                <ul className="space-y-2.5">
                  {[
                    { label: "Home", href: "/" },
                    { label: "Features", href: "#features" },
                    { label: "Pricing", href: "#pricing" },
                    { label: "FAQ", href: "#faq" },
                    { label: "Documentation", href: "/docs", isLink: true },
                  ].map((item) =>
                    item.isLink ? (
                      <li key={item.label}>
                        <Link
                          to={item.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ) : (
                      <li key={item.label}>
                        <a
                          href={item.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {item.label}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              </div>

              {/* Information */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-4">
                  Information
                </h4>
                <ul className="space-y-2.5">
                  <li>
                    <a
                      href="mailto:hello@linkycal.com"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Contact
                    </a>
                  </li>
                  <li>
                    <a
                      href="/privacy"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Privacy Policy
                    </a>
                  </li>
                  <li>
                    <a
                      href="/terms"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Terms of Service
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            {/* Copyright */}
            <div className="mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                &copy; 2026 LinkyCal
              </p>
              <p className="text-sm text-muted-foreground">
                A{" "}
                <a
                  href="https://launchfast.pro"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:text-brand transition-colors"
                >
                  LaunchFast
                </a>{" "}
                product
              </p>
            </div>
          </div>
        </footer>
      </div>

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
