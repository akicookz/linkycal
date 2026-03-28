import { fetchApi } from "@widget/api";
import { getRenderableRichTextHtml } from "@widget/rich-text";
import { injectStyles, type WidgetTheme } from "@widget/styles";

// ── Types ────────────────────────────────────────────────────────────────

interface FormWidgetOptions {
  projectSlug: string;
  formSlug: string;
  container: string | HTMLElement;
  theme?: WidgetTheme;
}

interface FieldOption {
  label: string;
  value: string;
}

interface FormField {
  id: string;
  type:
    | "text"
    | "textarea"
    | "email"
    | "phone"
    | "number"
    | "select"
    | "multi_select"
    | "checkbox"
    | "radio"
    | "date"
    | "time"
    | "file"
    | "rating";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
}

interface FormStep {
  title?: string;
  description?: string;
  richDescription?: string | null;
  fields: FormField[];
}

interface FormConfig {
  formName: string;
  description?: string;
  steps: FormStep[];
}

interface StartResponseResult {
  response: { id: string };
}

// ── State ────────────────────────────────────────────────────────────────

interface FormState {
  phase: "loading" | "form" | "submitting" | "success" | "error";
  config: FormConfig | null;
  responseId: string | null;
  currentStep: number;
  values: Record<string, any>; // fieldId -> value
  errors: Record<string, string>; // fieldId -> error message
  globalError: string | null;
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
      if (typeof child === "string") {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    }
  }
  return element;
}

const SVG_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function renderProgressIndicator(current: number, total: number, labels?: string[]): HTMLElement {
  const container = el("div", { className: "lc-progress" });
  for (let i = 0; i < total; i++) {
    if (i > 0) {
      const line = el("div", { className: `lc-progress-line${i <= current ? " completed" : ""}` });
      container.appendChild(line);
    }
    const step = el("div", { className: "lc-progress-step" });
    const inner = el("div", { className: "lc-progress-step-inner" });
    const circle = el("div", {
      className: `lc-progress-circle${i < current ? " completed" : i === current ? " active" : ""}`,
    });
    if (i < current) { circle.innerHTML = SVG_CHECK; } else { circle.textContent = String(i + 1); }
    inner.appendChild(circle);
    if (labels && labels[i]) {
      inner.appendChild(el("span", {
        className: `lc-progress-label${i === current ? " active" : ""}`,
        textContent: labels[i],
      }));
    }
    step.appendChild(inner);
    container.appendChild(step);
  }
  return container;
}

function renderRichTextBlock(
  richValue: string | null | undefined,
  fallbackPlainText: string | null | undefined,
  className: string,
): HTMLElement | null {
  const html = getRenderableRichTextHtml(richValue, fallbackPlainText);
  if (!html) return null;

  const element = el("div", { className });
  element.innerHTML = html;

  Array.from(element.querySelectorAll("a")).forEach((link) => {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });

  return element;
}

// ── Field Renderers ──────────────────────────────────────────────────────

function renderField(
  field: FormField,
  values: Record<string, any>,
  errors: Record<string, string>,
  onChange: (fieldId: string, value: any) => void,
): HTMLElement {
  const wrapper = el("div", { className: "lc-field" });

  // Label
  if (field.type !== "checkbox") {
    const label = el("label", { className: "lc-label" });
    label.textContent = field.label;
    if (field.required) {
      const req = el("span", { className: "lc-required", textContent: " *" });
      label.appendChild(req);
    }
    wrapper.appendChild(label);
  }

  const currentValue = values[field.id];

  switch (field.type) {
    case "text":
    case "email":
    case "phone":
    case "number":
    case "date":
    case "time": {
      const inputType =
        field.type === "phone" ? "tel" : field.type === "text" ? "text" : field.type;
      const input = document.createElement("input");
      input.className = "lc-input";
      input.type = inputType;
      input.placeholder = field.placeholder || "";
      input.value = currentValue ?? "";
      input.addEventListener("input", () => onChange(field.id, input.value));
      wrapper.appendChild(input);
      break;
    }

    case "textarea": {
      const textarea = document.createElement("textarea");
      textarea.className = "lc-input lc-textarea";
      textarea.placeholder = field.placeholder || "";
      textarea.value = currentValue ?? "";
      textarea.addEventListener("input", () => onChange(field.id, textarea.value));
      wrapper.appendChild(textarea);
      break;
    }

    case "select": {
      const select = document.createElement("select");
      select.className = "lc-select";

      // Default empty option
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = field.placeholder || "Select...";
      defaultOpt.disabled = true;
      if (!currentValue) defaultOpt.selected = true;
      select.appendChild(defaultOpt);

      for (const opt of field.options || []) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (currentValue === opt.value) option.selected = true;
        select.appendChild(option);
      }

      select.addEventListener("change", () => onChange(field.id, select.value));
      wrapper.appendChild(select);
      break;
    }

    case "multi_select": {
      const group = el("div", { className: "lc-checkbox-group" });
      const selected: string[] = currentValue || [];

      for (const opt of field.options || []) {
        const label = el("label", { className: "lc-checkbox-label" });
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = opt.value;
        input.checked = selected.includes(opt.value);
        input.addEventListener("change", () => {
          const current: string[] = values[field.id] || [];
          if (input.checked) {
            onChange(field.id, [...current, opt.value]);
          } else {
            onChange(field.id, current.filter((v) => v !== opt.value));
          }
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(opt.label));
        group.appendChild(label);
      }

      wrapper.appendChild(group);
      break;
    }

    case "checkbox": {
      const label = el("label", { className: "lc-checkbox-label" });
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!currentValue;
      input.addEventListener("change", () => onChange(field.id, input.checked));
      label.appendChild(input);
      label.appendChild(document.createTextNode(field.label));
      if (field.required) {
        const req = el("span", { className: "lc-required", textContent: " *" });
        label.appendChild(req);
      }
      wrapper.appendChild(label);
      break;
    }

    case "radio": {
      const group = el("div", { className: "lc-radio-group" });

      for (const opt of field.options || []) {
        const label = el("label", { className: "lc-radio-label" });
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `lc-radio-${field.id}`;
        input.value = opt.value;
        input.checked = currentValue === opt.value;
        input.addEventListener("change", () => onChange(field.id, opt.value));
        label.appendChild(input);
        label.appendChild(document.createTextNode(opt.label));
        group.appendChild(label);
      }

      wrapper.appendChild(group);
      break;
    }

    case "file": {
      const input = document.createElement("input");
      input.className = "lc-input";
      input.type = "file";
      input.style.padding = "8px 12px";
      input.style.height = "auto";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        onChange(field.id, file ? file.name : "");
      });
      wrapper.appendChild(input);
      break;
    }

    case "rating": {
      const rating = el("div", { className: "lc-rating" });
      const currentRating = currentValue || 0;

      for (let i = 1; i <= 5; i++) {
        const star = document.createElement("button");
        star.type = "button";
        star.className = i <= currentRating ? "filled" : "";
        star.innerHTML = "&#9733;"; // filled star character
        star.addEventListener("click", () => {
          onChange(field.id, i);
          // Re-render stars
          const stars = rating.querySelectorAll("button");
          stars.forEach((s, idx) => {
            s.className = idx < i ? "filled" : "";
          });
        });
        star.addEventListener("mouseenter", () => {
          const stars = rating.querySelectorAll("button");
          stars.forEach((s, idx) => {
            s.className = idx < i ? "filled" : "";
          });
        });
        star.addEventListener("mouseleave", () => {
          const val = values[field.id] || 0;
          const stars = rating.querySelectorAll("button");
          stars.forEach((s, idx) => {
            s.className = idx < val ? "filled" : "";
          });
        });
        rating.appendChild(star);
      }

      wrapper.appendChild(rating);
      break;
    }
  }

  // Error message
  if (errors[field.id]) {
    wrapper.appendChild(
      el("div", { className: "lc-error", textContent: errors[field.id] }),
    );
  }

  return wrapper;
}

// ── Main Widget ──────────────────────────────────────────────────────────

function initFormWidget(options: FormWidgetOptions): void {
  const { projectSlug, formSlug, theme } = options;

  // Resolve container
  const root =
    typeof options.container === "string"
      ? document.querySelector<HTMLElement>(options.container)
      : options.container;

  if (!root) {
    console.error("[LinkyCal] Container not found:", options.container);
    return;
  }

  // Inject styles with theme
  injectStyles(root, theme);

  // Create widget wrapper
  const wrapper = el("div", { className: "lc-widget" });
  root.appendChild(wrapper);

  // State
  const state: FormState = {
    phase: "loading",
    config: null,
    responseId: null,
    currentStep: 0,
    values: {},
    errors: {},
    globalError: null,
  };

  // ── Render ──

  function render(): void {
    wrapper.innerHTML = "";

    switch (state.phase) {
      case "loading":
        wrapper.appendChild(renderLoading());
        break;
      case "form":
        wrapper.appendChild(renderFormStep());
        break;
      case "submitting":
        wrapper.appendChild(renderLoading("Submitting..."));
        break;
      case "success":
        wrapper.appendChild(renderSuccess());
        break;
      case "error":
        wrapper.appendChild(renderErrorView());
        break;
    }

    // Powered by
    const powered = el("div", { className: "lc-powered" });
    powered.innerHTML = `Powered by <a href="https://linkycal.com" target="_blank" rel="noopener">LinkyCal</a>`;
    wrapper.appendChild(powered);
  }

  // ── View: Loading ──

  function renderLoading(msg = "Loading..."): HTMLElement {
    return el("div", { className: "lc-card lc-loading", textContent: msg });
  }

  // ── View: Error ──

  function renderErrorView(): HTMLElement {
    const card = el("div", { className: "lc-card" });
    card.appendChild(
      el("div", { className: "lc-title", textContent: "Something went wrong" }),
    );
    card.appendChild(
      el("div", {
        className: "lc-subtitle",
        textContent: state.globalError || "Please try again later.",
      }),
    );

    const retryBtn = el("button", {
      className: "lc-btn lc-btn-primary",
      textContent: "Try Again",
    });
    retryBtn.addEventListener("click", () => loadFormConfig());
    card.appendChild(retryBtn);

    return card;
  }

  // ── View: Form Step ──

  function renderFormStep(): HTMLElement {
    const config = state.config!;
    const step = config.steps[state.currentStep];
    const totalSteps = config.steps.length;

    const card = el("div", { className: "lc-card" });

    // Progress indicator (only if multi-step)
    if (totalSteps > 1) {
      const stepLabels = config.steps.map((s, i) => s.title || `Step ${i + 1}`);
      card.appendChild(renderProgressIndicator(state.currentStep, totalSteps, stepLabels));
    }

    // Title
    const title = step.title || config.formName;
    card.appendChild(el("div", { className: "lc-title", textContent: title }));

    // Description
    const richDescription = renderRichTextBlock(
      step.richDescription,
      step.description,
      "lc-subtitle",
    );
    if (richDescription) {
      card.appendChild(richDescription);
    } else if (state.currentStep === 0 && config.description) {
      card.appendChild(
        el("div", { className: "lc-subtitle", textContent: config.description }),
      );
    }

    // (Step counter replaced by progress indicator above)

    // Fields
    const fieldsContainer = el("div");
    for (const field of step.fields) {
      fieldsContainer.appendChild(
        renderField(field, state.values, state.errors, (fieldId, value) => {
          state.values[fieldId] = value;
          // Clear error for this field
          delete state.errors[fieldId];
        }),
      );
    }
    card.appendChild(fieldsContainer);

    // Global error
    if (state.globalError) {
      card.appendChild(
        el("div", { className: "lc-error", textContent: state.globalError }),
      );
    }

    // Navigation
    const nav = el("div", { className: "lc-nav" });

    if (state.currentStep > 0) {
      const backBtn = el("button", {
        className: "lc-btn lc-btn-outline",
        textContent: "Back",
      });
      backBtn.addEventListener("click", () => {
        state.currentStep--;
        state.errors = {};
        state.globalError = null;
        render();
      });
      nav.appendChild(backBtn);
    } else {
      // Spacer
      nav.appendChild(el("div"));
    }

    const isLastStep = state.currentStep === totalSteps - 1;
    const nextBtn = el("button", {
      className: "lc-btn lc-btn-primary",
      textContent: isLastStep ? "Submit" : "Next",
    });
    nextBtn.addEventListener("click", () => handleNext(step, isLastStep, nextBtn));
    nav.appendChild(nextBtn);

    card.appendChild(nav);

    return card;
  }

  // ── View: Success ──

  function renderSuccess(): HTMLElement {
    const card = el("div", { className: "lc-card" });
    const success = el("div", { className: "lc-success" });

    const iconWrap = el("div", { className: "lc-success-icon" });
    iconWrap.innerHTML = SVG_CHECK;
    success.appendChild(iconWrap);

    success.appendChild(
      el("div", { className: "lc-title", textContent: "Thank you!" }),
    );
    success.appendChild(
      el("div", {
        className: "lc-subtitle",
        textContent: "Your response has been submitted successfully.",
      }),
    );

    // Submit another
    const anotherBtn = el("button", {
      className: "lc-btn lc-btn-outline",
      textContent: "Submit another response",
    });
    anotherBtn.style.marginTop = "12px";
    anotherBtn.addEventListener("click", () => {
      state.currentStep = 0;
      state.values = {};
      state.errors = {};
      state.globalError = null;
      state.responseId = null;
      state.phase = "form";
      startResponse();
    });
    success.appendChild(anotherBtn);

    card.appendChild(success);
    return card;
  }

  // ── Validation ──

  function validateStep(step: FormStep): boolean {
    state.errors = {};
    let valid = true;

    for (const field of step.fields) {
      if (field.required) {
        const val = state.values[field.id];

        if (field.type === "checkbox") {
          if (!val) {
            state.errors[field.id] = `${field.label} is required.`;
            valid = false;
          }
        } else if (field.type === "multi_select") {
          if (!val || (Array.isArray(val) && val.length === 0)) {
            state.errors[field.id] = `Please select at least one option.`;
            valid = false;
          }
        } else if (field.type === "rating") {
          if (!val || val < 1) {
            state.errors[field.id] = `Please provide a rating.`;
            valid = false;
          }
        } else {
          if (!val || (typeof val === "string" && !val.trim())) {
            state.errors[field.id] = `${field.label} is required.`;
            valid = false;
          }
        }
      }

      // Email validation
      if (field.type === "email" && state.values[field.id]) {
        const email = state.values[field.id];
        if (typeof email === "string" && !email.includes("@")) {
          state.errors[field.id] = "Please enter a valid email address.";
          valid = false;
        }
      }
    }

    return valid;
  }

  // ── Actions ──

  async function handleNext(
    step: FormStep,
    isLastStep: boolean,
    btn: HTMLElement,
  ): Promise<void> {
    if (!validateStep(step)) {
      render();
      return;
    }

    btn.textContent = isLastStep ? "Submitting..." : "Saving...";
    btn.setAttribute("disabled", "true");
    btn.style.opacity = "0.7";

    try {
      // Collect values for this step's fields as array (matches server schema)
      const stepFields = step.fields.map((field) => ({
        fieldId: field.id,
        value: state.values[field.id] ?? "",
      }));

      // Submit step data
      await fetchApi(
        `/api/v1/forms/${formSlug}/responses/${state.responseId}/steps/${state.currentStep}`,
        {
          method: "PATCH",
          body: JSON.stringify({ fields: stepFields }),
        },
      );

      if (isLastStep) {
        state.phase = "success";
      } else {
        state.currentStep++;
        state.errors = {};
        state.globalError = null;
      }
    } catch (err) {
      state.globalError =
        err instanceof Error ? err.message : "Failed to save. Please try again.";
    }

    render();
  }

  async function loadFormConfig(): Promise<void> {
    state.phase = "loading";
    state.globalError = null;
    render();

    try {
      const config = await fetchApi<FormConfig>(
        `/api/widget/form/${projectSlug}/${formSlug}/config`,
      );
      state.config = config;
      state.phase = "form";
      await startResponse();
    } catch (err) {
      state.globalError =
        err instanceof Error ? err.message : "Failed to load form.";
      state.phase = "error";
      render();
    }
  }

  const widgetLoadedAt = btoa(String(Date.now()));

  async function startResponse(): Promise<void> {
    try {
      const result = await fetchApi<StartResponseResult>(
        `/api/v1/forms/${formSlug}/responses?projectSlug=${encodeURIComponent(projectSlug)}`,
        { method: "POST", body: JSON.stringify({ _token: widgetLoadedAt }) },
      );
      state.responseId = result.response.id;
    } catch (err) {
      // Non-critical: we'll still show the form and retry on submit
      console.warn("[LinkyCal] Failed to start response:", err);
    }

    render();
  }

  // ── Kick off ──

  loadFormConfig();
}

// ── Expose globally ──────────────────────────────────────────────────────

(window as any).LinkyCal = (window as any).LinkyCal || {};
(window as any).LinkyCal.form = initFormWidget;
