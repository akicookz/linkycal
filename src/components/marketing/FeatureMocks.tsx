import { useState, useEffect, useRef } from "react";
import { Check, ChevronDown, Clock, Send, Star, Tag, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// March 2026 starts on Sunday (day 0). 31 days. (Shared with the landing hero
// card, which keeps its own copy.)
const MAR_2026_DAYS = 31;
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/* ─── Mock Form Builder UI ────────────────────────────────────────────────── */

export function MockFormBuilderUI() {
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

export function MockBookingUI() {
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

export function MockContactCrmUI() {
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

export function MockApiUI() {
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

export function MockWorkflowUI() {
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
