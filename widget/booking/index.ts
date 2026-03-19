import { fetchApi } from "@widget/api";
import { injectStyles, type WidgetTheme } from "@widget/styles";

// ── Types ────────────────────────────────────────────────────────────────

interface BookingWidgetOptions {
  projectSlug: string;
  eventTypeSlug: string;
  container: string | HTMLElement;
  theme?: WidgetTheme;
}

interface EventType {
  id: string;
  slug: string;
  name: string;
  description?: string;
  duration: number;
  location?: string;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface BookingState {
  step: "loading" | "date" | "time" | "details" | "submitting" | "confirmed" | "error";
  eventType: EventType | null;
  projectName: string;
  currentMonth: Date;
  selectedDate: Date | null;
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  form: { name: string; email: string; phone: string; notes: string };
  error: string | null;
  timezone: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (HTMLElement | string)[],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") element.className = v;
      else if (k === "textContent") element.textContent = v;
      else element.setAttribute(k, v);
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === "string") element.appendChild(document.createTextNode(child));
      else element.appendChild(child);
    }
  }
  return element;
}

function formatTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: tz,
    });
  } catch { return iso; }
}

function formatDateFull(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isPastDay(d: Date): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const check = new Date(d); check.setHours(0, 0, 0, 0);
  return check < today;
}

const SVG_CHEVRON_L = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_CHEVRON_R = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SVG_ARROW_LEFT = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ── Main Widget ──────────────────────────────────────────────────────────

function initBookingWidget(options: BookingWidgetOptions): void {
  const { projectSlug, eventTypeSlug, theme } = options;
  const widgetLoadedAt = btoa(String(Date.now()));

  const root =
    typeof options.container === "string"
      ? document.querySelector<HTMLElement>(options.container)
      : options.container;

  if (!root) {
    console.error("[LinkyCal] Container not found:", options.container);
    return;
  }

  injectStyles(root, theme);

  const wrapper = el("div", { className: "lc-widget" });
  root.appendChild(wrapper);

  const state: BookingState = {
    step: "loading",
    eventType: null,
    projectName: "",
    currentMonth: new Date(),
    selectedDate: null,
    slots: [],
    selectedSlot: null,
    form: { name: "", email: "", phone: "", notes: "" },
    error: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  // ── Step index helper ──

  function stepIndex(): number {
    switch (state.step) {
      case "date": return 0;
      case "time": return 1;
      case "details": case "submitting": return 2;
      default: return -1;
    }
  }

  // ── Render ──

  function render(): void {
    wrapper.innerHTML = "";

    const card = el("div", { className: "lc-card" });

    // Event header (always shown except loading/error)
    if (state.eventType && state.step !== "loading" && state.step !== "error") {
      card.appendChild(renderEventHeader());
    }

    // Progress indicator (steps 1-3)
    const si = stepIndex();
    if (si >= 0) {
      card.appendChild(renderProgress(si));
    }

    // Step content
    switch (state.step) {
      case "loading": card.appendChild(renderLoading()); break;
      case "date": card.appendChild(renderDateStep()); break;
      case "time": card.appendChild(renderTimeStep()); break;
      case "details": card.appendChild(renderDetailsStep()); break;
      case "submitting": card.appendChild(renderLoading("Booking your appointment...")); break;
      case "confirmed": card.appendChild(renderConfirmed()); break;
      case "error": card.appendChild(renderError()); break;
    }

    wrapper.appendChild(card);

    // Powered by
    const powered = el("div", { className: "lc-powered" });
    powered.innerHTML = `Powered by <a href="https://linkycal.com" target="_blank" rel="noopener">LinkyCal</a>`;
    wrapper.appendChild(powered);
  }

  // ── Event Header ──

  function renderEventHeader(): HTMLElement {
    const header = el("div", { className: "lc-event-header" });
    header.appendChild(el("strong", { textContent: state.eventType!.name }));
    header.appendChild(el("span", { className: "lc-dot" }));
    header.appendChild(el("span", { textContent: `${state.eventType!.duration} min` }));
    if (state.eventType!.location) {
      header.appendChild(el("span", { className: "lc-dot" }));
      header.appendChild(el("span", { textContent: state.eventType!.location }));
    }
    return header;
  }

  // ── Progress Indicator ──

  function renderProgress(current: number): HTMLElement {
    const labels = ["Date", "Time", "Details"];
    const container = el("div", { className: "lc-progress" });

    for (let i = 0; i < labels.length; i++) {
      if (i > 0) {
        const line = el("div", { className: `lc-progress-line${i <= current ? " completed" : ""}` });
        container.appendChild(line);
      }

      const step = el("div", { className: "lc-progress-step" });
      const inner = el("div", { className: "lc-progress-step-inner" });

      const circle = el("div", {
        className: `lc-progress-circle${i < current ? " completed" : i === current ? " active" : ""}`,
      });

      if (i < current) {
        circle.innerHTML = SVG_CHECK;
      } else {
        circle.textContent = String(i + 1);
      }

      const label = el("span", {
        className: `lc-progress-label${i === current ? " active" : ""}`,
        textContent: labels[i],
      });

      inner.appendChild(circle);
      inner.appendChild(label);
      step.appendChild(inner);
      container.appendChild(step);
    }

    return container;
  }

  // ── Loading ──

  function renderLoading(msg = "Loading..."): HTMLElement {
    return el("div", { className: "lc-loading", textContent: msg });
  }

  // ── Error ──

  function renderError(): HTMLElement {
    const wrap = el("div");
    wrap.appendChild(el("div", { className: "lc-title", textContent: "Something went wrong" }));
    wrap.appendChild(el("div", { className: "lc-subtitle", textContent: state.error || "Please try again." }));
    const btn = el("button", { className: "lc-btn lc-btn-primary", textContent: "Try Again" });
    btn.addEventListener("click", () => loadConfig());
    wrap.appendChild(btn);
    return wrap;
  }

  // ── Step 1: Date ──

  function renderDateStep(): HTMLElement {
    const wrap = el("div");
    wrap.appendChild(el("div", { className: "lc-step-title", textContent: "Select a date" }));

    // Month nav
    const monthNav = el("div", { className: "lc-month-nav" });
    const prevBtn = el("button");
    prevBtn.innerHTML = SVG_CHEVRON_L;
    const now = new Date();
    if (state.currentMonth.getFullYear() === now.getFullYear() && state.currentMonth.getMonth() === now.getMonth()) {
      prevBtn.setAttribute("disabled", "true");
      prevBtn.style.opacity = "0.3";
      prevBtn.style.pointerEvents = "none";
    }
    prevBtn.addEventListener("click", () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
      render();
    });

    const nextBtn = el("button");
    nextBtn.innerHTML = SVG_CHEVRON_R;
    nextBtn.addEventListener("click", () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
      render();
    });

    const monthTitle = el("span", {
      className: "lc-month-title",
      textContent: state.currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });

    monthNav.appendChild(prevBtn);
    monthNav.appendChild(monthTitle);
    monthNav.appendChild(nextBtn);
    wrap.appendChild(monthNav);

    // Calendar grid
    const grid = el("div", { className: "lc-calendar" });
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const d of days) grid.appendChild(el("div", { className: "lc-cal-header", textContent: d }));

    const year = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) grid.appendChild(el("div", { className: "lc-cal-day disabled" }));

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const classes = ["lc-cal-day"];
      if (isPastDay(date)) classes.push("disabled");
      if (isSameDay(date, new Date())) classes.push("today");
      if (state.selectedDate && isSameDay(date, state.selectedDate)) classes.push("active");

      const dayBtn = el("button", { className: classes.join(" "), textContent: String(d) });
      if (!isPastDay(date)) {
        dayBtn.addEventListener("click", () => {
          state.selectedDate = date;
          state.selectedSlot = null;
          loadSlots(date);
        });
      }
      grid.appendChild(dayBtn);
    }

    wrap.appendChild(grid);
    wrap.appendChild(el("div", { className: "lc-timezone", textContent: `Times shown in ${state.timezone}` }));

    return wrap;
  }

  // ── Step 2: Time ──

  function renderTimeStep(): HTMLElement {
    const wrap = el("div");
    wrap.appendChild(el("div", { className: "lc-step-title", textContent: "Select a time" }));
    wrap.appendChild(el("div", {
      className: "lc-subtitle",
      textContent: state.selectedDate ? formatDateFull(state.selectedDate) : "",
    }));

    if (state.slots.length === 0) {
      wrap.appendChild(el("div", {
        className: "lc-subtitle",
        textContent: "No available times for this date.",
      }));
    } else {
      const grid = el("div", { className: "lc-slots" });
      for (const slot of state.slots) {
        const classes = ["lc-slot"];
        if (state.selectedSlot?.start === slot.start) classes.push("selected");
        const btn = el("button", { className: classes.join(" "), textContent: formatTime(slot.start, state.timezone) });
        btn.addEventListener("click", () => {
          state.selectedSlot = slot;
          state.step = "details";
          render();
        });
        grid.appendChild(btn);
      }
      wrap.appendChild(grid);
    }

    wrap.appendChild(el("div", { className: "lc-timezone", textContent: `Times shown in ${state.timezone}` }));

    // Nav
    const nav = el("div", { className: "lc-nav" });
    const backBtn = el("button", { className: "lc-btn lc-btn-outline" });
    backBtn.innerHTML = `${SVG_ARROW_LEFT} Back`;
    backBtn.addEventListener("click", () => { state.step = "date"; state.selectedSlot = null; render(); });
    nav.appendChild(backBtn);
    nav.appendChild(el("div")); // spacer
    wrap.appendChild(nav);

    return wrap;
  }

  // ── Step 3: Details ──

  function renderDetailsStep(): HTMLElement {
    const wrap = el("div");
    wrap.appendChild(el("div", { className: "lc-step-title", textContent: "Your details" }));

    // Summary card
    if (state.selectedSlot && state.selectedDate) {
      const summary = el("div", { className: "lc-summary-card" });
      summary.appendChild(el("div", { className: "lc-summary-date", textContent: formatDateShort(state.selectedDate) }));
      summary.appendChild(el("div", {
        className: "lc-summary-time",
        textContent: `${formatTime(state.selectedSlot.start, state.timezone)} – ${formatTime(state.selectedSlot.end, state.timezone)} (${state.eventType!.duration} min)`,
      }));
      wrap.appendChild(summary);
    }

    // Form fields
    const fields: Array<{ key: keyof typeof state.form; label: string; type: string; placeholder: string; required: boolean }> = [
      { key: "name", label: "Name", type: "text", placeholder: "Your name", required: true },
      { key: "email", label: "Email", type: "email", placeholder: "you@example.com", required: true },
      { key: "phone", label: "Phone", type: "tel", placeholder: "+1 (555) 000-0000", required: false },
    ];

    for (const f of fields) {
      const field = el("div", { className: "lc-field" });
      const label = el("label", { className: "lc-label" });
      label.innerHTML = f.required ? `${f.label} <span class="lc-required">*</span>` : f.label;
      const input = el("input", { className: "lc-input", type: f.type, placeholder: f.placeholder }) as HTMLInputElement;
      input.value = state.form[f.key];
      input.addEventListener("input", () => { state.form[f.key] = input.value; });
      field.appendChild(label);
      field.appendChild(input);
      wrap.appendChild(field);
    }

    // Notes
    const notesField = el("div", { className: "lc-field" });
    notesField.appendChild(el("label", { className: "lc-label", textContent: "Notes" }));
    const textarea = document.createElement("textarea");
    textarea.className = "lc-input lc-textarea";
    textarea.placeholder = "Anything you'd like us to know?";
    textarea.value = state.form.notes;
    textarea.addEventListener("input", () => { state.form.notes = textarea.value; });
    notesField.appendChild(textarea);
    wrap.appendChild(notesField);

    // Error
    const errorDiv = el("div", { className: "lc-error", id: "lc-form-error" });
    errorDiv.style.display = "none";
    wrap.appendChild(errorDiv);

    // Nav
    const nav = el("div", { className: "lc-nav" });
    const backBtn = el("button", { className: "lc-btn lc-btn-outline" });
    backBtn.innerHTML = `${SVG_ARROW_LEFT} Back`;
    backBtn.addEventListener("click", () => { state.step = "time"; render(); });

    const submitBtn = el("button", { className: "lc-btn lc-btn-primary", textContent: "Confirm Booking" });
    submitBtn.addEventListener("click", () => submitBooking(errorDiv, submitBtn));

    nav.appendChild(backBtn);
    nav.appendChild(submitBtn);
    wrap.appendChild(nav);

    return wrap;
  }

  // ── Confirmed ──

  function renderConfirmed(): HTMLElement {
    const wrap = el("div", { className: "lc-success" });

    const icon = el("div", { className: "lc-success-icon" });
    icon.innerHTML = SVG_CHECK;
    wrap.appendChild(icon);

    wrap.appendChild(el("div", { className: "lc-title", textContent: "Booking confirmed!" }));
    wrap.appendChild(el("div", {
      className: "lc-subtitle",
      textContent: `You're booked with ${state.projectName}.`,
    }));

    // Summary
    if (state.selectedSlot && state.selectedDate) {
      const summary = el("div", { className: "lc-summary-card" });
      summary.style.textAlign = "left";
      summary.appendChild(el("div", { className: "lc-summary-date", textContent: `${state.eventType!.name}` }));
      summary.appendChild(el("div", {
        className: "lc-summary-time",
        textContent: `${formatDateFull(state.selectedDate)} · ${formatTime(state.selectedSlot.start, state.timezone)} – ${formatTime(state.selectedSlot.end, state.timezone)}`,
      }));
      wrap.appendChild(summary);
    }

    wrap.appendChild(el("div", {
      className: "lc-subtitle",
      textContent: `A confirmation email has been sent to ${state.form.email}.`,
    }));

    const anotherBtn = el("button", { className: "lc-btn lc-btn-outline", textContent: "Book another time" });
    anotherBtn.style.marginTop = "8px";
    anotherBtn.addEventListener("click", () => {
      state.selectedDate = null;
      state.selectedSlot = null;
      state.slots = [];
      state.form = { name: "", email: "", phone: "", notes: "" };
      state.step = "date";
      render();
    });
    wrap.appendChild(anotherBtn);

    return wrap;
  }

  // ── API ──

  async function loadConfig(): Promise<void> {
    state.step = "loading";
    state.error = null;
    render();

    try {
      const data = await fetchApi<{ project: { name: string }; eventTypes: EventType[] }>(
        `/api/widget/booking/${projectSlug}/config`,
      );
      state.projectName = data.project.name;
      const found = data.eventTypes.find((e) => e.slug === eventTypeSlug);
      if (!found) {
        state.error = `Event type "${eventTypeSlug}" not found or disabled.`;
        state.step = "error";
      } else {
        state.eventType = found;
        state.step = "date";
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : "Failed to load booking configuration.";
      state.step = "error";
    }
    render();
  }

  async function loadSlots(date: Date): Promise<void> {
    state.step = "loading";
    render();

    try {
      const params = new URLSearchParams({
        date: dateToYMD(date),
        timezone: state.timezone,
        eventTypeSlug: state.eventType!.slug,
      });
      const data = await fetchApi<{ slots: TimeSlot[] }>(
        `/api/v1/availability/${projectSlug}?${params}`,
      );
      state.slots = data.slots;
      state.step = "time";
    } catch (err) {
      state.error = err instanceof Error ? err.message : "Failed to load available times.";
      state.step = "error";
    }
    render();
  }

  async function submitBooking(errorDiv: HTMLElement, submitBtn: HTMLElement): Promise<void> {
    if (!state.form.name.trim()) { errorDiv.textContent = "Name is required."; errorDiv.style.display = "block"; return; }
    if (!state.form.email.trim() || !state.form.email.includes("@")) { errorDiv.textContent = "A valid email is required."; errorDiv.style.display = "block"; return; }

    errorDiv.style.display = "none";
    submitBtn.textContent = "Booking...";
    submitBtn.setAttribute("disabled", "true");
    submitBtn.style.opacity = "0.6";

    try {
      await fetchApi("/api/v1/bookings", {
        method: "POST",
        body: JSON.stringify({
          projectSlug,
          eventTypeSlug: state.eventType!.slug,
          startTime: state.selectedSlot!.start,
          timezone: state.timezone,
          name: state.form.name.trim(),
          email: state.form.email.trim(),
          notes: state.form.notes.trim() || undefined,
          _token: widgetLoadedAt,
        }),
      });
      state.step = "confirmed";
    } catch (err) {
      errorDiv.textContent = err instanceof Error ? err.message : "Booking failed. Please try again.";
      errorDiv.style.display = "block";
      submitBtn.textContent = "Confirm Booking";
      submitBtn.removeAttribute("disabled");
      submitBtn.style.opacity = "1";
      return;
    }
    render();
  }

  // ── Start ──
  loadConfig();
}

// ── Expose ───────────────────────────────────────────────────────────────

(window as any).LinkyCal = (window as any).LinkyCal || {};
(window as any).LinkyCal.booking = initBookingWidget;
