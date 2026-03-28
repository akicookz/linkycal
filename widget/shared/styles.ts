// ─── Theme Types ─────────────────────────────────────────────────────────────

export interface WidgetTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
}

export const DEFAULT_THEME: Required<WidgetTheme> = {
  primaryBg: "#1B4332",
  primaryText: "#ffffff",
  backgroundColor: "#ffffff",
  textColor: "#0f1a14",
  borderRadius: 16,
};

// ─── Apply Theme ─────────────────────────────────────────────────────────────

export function resolveTheme(theme?: WidgetTheme): Required<WidgetTheme> {
  return { ...DEFAULT_THEME, ...theme };
}

export function applyTheme(container: HTMLElement, theme: Required<WidgetTheme>) {
  container.style.setProperty("--lc-primary-bg", theme.primaryBg);
  container.style.setProperty("--lc-primary-text", theme.primaryText);
  container.style.setProperty("--lc-bg", theme.backgroundColor);
  container.style.setProperty("--lc-text", theme.textColor);
  container.style.setProperty("--lc-radius", `${theme.borderRadius}px`);
  container.style.setProperty("--lc-radius-lg", `${theme.borderRadius + 4}px`);
  container.style.setProperty("--lc-radius-sm", `${Math.max(theme.borderRadius - 4, 4)}px`);
}

// ─── Inject Styles ───────────────────────────────────────────────────────────

export function injectStyles(container: HTMLElement, theme?: WidgetTheme) {
  const resolved = resolveTheme(theme);
  applyTheme(container, resolved);

  const style = document.createElement("style");
  style.textContent = getWidgetCSS();
  container.appendChild(style);
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

export function getWidgetCSS(): string {
  return `
    @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');

    .lc-widget {
      font-family: 'Satoshi', system-ui, sans-serif;
      color: var(--lc-text, #0f1a14);
      background: var(--lc-bg, #ffffff);
      box-sizing: border-box;
    }
    .lc-widget * { box-sizing: border-box; margin: 0; padding: 0; }
    .lc-widget button { cursor: pointer; font-family: inherit; }

    .lc-card {
      background: var(--lc-bg, #ffffff);
      border: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 10%, transparent);
      border-radius: var(--lc-radius-lg, 20px);
      padding: 24px;
    }

    .lc-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; color: var(--lc-text, #0f1a14); }
    .lc-subtitle { font-size: 14px; color: color-mix(in srgb, var(--lc-text, #0f1a14) 55%, transparent); margin-bottom: 20px; line-height: 1.6; }
    .lc-subtitle p:not(:last-child) { margin-bottom: 8px; }
    .lc-subtitle a { color: var(--lc-primary-bg, #1B4332); text-decoration: underline; text-underline-offset: 2px; }
    .lc-subtitle strong { font-weight: 600; }
    .lc-subtitle em { font-style: italic; }

    .lc-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      height: 40px; padding: 0 20px;
      border-radius: var(--lc-radius, 16px);
      font-size: 14px; font-weight: 500; border: none;
      transition: all 0.15s;
    }
    .lc-btn-primary {
      background: var(--lc-primary-bg, #1B4332);
      color: var(--lc-primary-text, #ffffff);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 20px color-mix(in srgb, var(--lc-primary-bg, #1B4332) 25%, transparent);
    }
    .lc-btn-primary:hover {
      filter: brightness(0.9);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 0 28px color-mix(in srgb, var(--lc-primary-bg, #1B4332) 35%, transparent);
    }
    .lc-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
    .lc-btn-outline {
      background: var(--lc-bg, #ffffff);
      color: var(--lc-text, #0f1a14);
      border: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 12%, transparent);
    }
    .lc-btn-outline:hover { background: color-mix(in srgb, var(--lc-text, #0f1a14) 4%, var(--lc-bg, #ffffff)); }

    .lc-input {
      width: 100%; height: 40px; padding: 0 12px;
      border: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 12%, transparent);
      border-radius: var(--lc-radius-sm, 12px);
      font-size: 14px; font-family: inherit; outline: none;
      background: var(--lc-bg, #ffffff);
      color: var(--lc-text, #0f1a14);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .lc-input::placeholder { color: color-mix(in srgb, var(--lc-text, #0f1a14) 35%, transparent); }
    .lc-input:focus {
      border-color: var(--lc-primary-bg, #1B4332);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--lc-primary-bg, #1B4332) 15%, transparent);
    }
    .lc-textarea { min-height: 80px; padding: 10px 12px; resize: vertical; }

    .lc-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--lc-text, #0f1a14); }
    .lc-required { color: #dc2626; }
    .lc-field { margin-bottom: 16px; }
    .lc-error { font-size: 12px; color: #dc2626; margin-top: 4px; }

    .lc-calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .lc-cal-header {
      font-size: 12px; font-weight: 600; text-align: center; padding: 8px 0;
      color: color-mix(in srgb, var(--lc-text, #0f1a14) 45%, transparent);
    }
    .lc-cal-day {
      aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
      border-radius: var(--lc-radius-sm, 12px);
      font-size: 14px; border: none; background: transparent;
      color: var(--lc-text, #0f1a14);
    }
    .lc-cal-day:hover { background: color-mix(in srgb, var(--lc-text, #0f1a14) 5%, var(--lc-bg, #ffffff)); }
    .lc-cal-day.active { background: var(--lc-primary-bg, #1B4332); color: var(--lc-primary-text, #ffffff); }
    .lc-cal-day.disabled { opacity: 0.3; pointer-events: none; }
    .lc-cal-day.today { font-weight: 700; }

    .lc-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
    @media (max-width: 400px) { .lc-slots { grid-template-columns: repeat(2, 1fr); } }
    .lc-slot {
      padding: 10px;
      border-radius: var(--lc-radius-sm, 12px);
      border: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 12%, transparent);
      text-align: center; font-size: 14px; font-weight: 500;
      background: var(--lc-bg, #ffffff);
      color: var(--lc-text, #0f1a14);
      cursor: pointer; transition: all 0.15s;
    }
    .lc-slot:hover {
      border-color: var(--lc-primary-bg, #1B4332);
      background: color-mix(in srgb, var(--lc-primary-bg, #1B4332) 5%, var(--lc-bg, #ffffff));
    }
    .lc-slot.selected { background: var(--lc-primary-bg, #1B4332); color: var(--lc-primary-text, #ffffff); border-color: var(--lc-primary-bg, #1B4332); }

    .lc-progress { display: flex; align-items: flex-start; justify-content: center; margin-bottom: 28px; }
    .lc-progress-step { display: flex; align-items: flex-start; }
    .lc-progress-step-inner { display: flex; flex-direction: column; align-items: center; }
    .lc-progress-circle {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600;
      border: 2px solid color-mix(in srgb, var(--lc-text, #0f1a14) 15%, transparent);
      color: color-mix(in srgb, var(--lc-text, #0f1a14) 35%, transparent);
      background: transparent;
      transition: all 0.2s;
    }
    .lc-progress-circle.active {
      background: var(--lc-primary-bg, #1B4332); color: var(--lc-primary-text, #ffffff);
      border-color: var(--lc-primary-bg, #1B4332);
    }
    .lc-progress-circle.completed {
      background: var(--lc-primary-bg, #1B4332); color: var(--lc-primary-text, #ffffff);
      border-color: var(--lc-primary-bg, #1B4332);
    }
    .lc-progress-circle svg { width: 14px; height: 14px; }
    .lc-progress-label {
      font-size: 11px; font-weight: 500; margin-top: 4px; text-align: center;
      color: color-mix(in srgb, var(--lc-text, #0f1a14) 40%, transparent);
    }
    .lc-progress-label.active { color: var(--lc-text, #0f1a14); font-weight: 600; }
    .lc-progress-line {
      width: 48px; height: 2px; margin-top: 13px;
      background: color-mix(in srgb, var(--lc-text, #0f1a14) 12%, transparent);
      transition: background 0.2s;
    }
    .lc-progress-line.completed { background: var(--lc-primary-bg, #1B4332); }

    .lc-event-header {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 13px; color: color-mix(in srgb, var(--lc-text, #0f1a14) 55%, transparent);
      margin-bottom: 20px; padding-bottom: 16px;
      border-bottom: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 8%, transparent);
    }
    .lc-event-header strong { font-weight: 600; color: var(--lc-text, #0f1a14); font-size: 15px; }
    .lc-event-header .lc-dot { width: 3px; height: 3px; border-radius: 50%; background: color-mix(in srgb, var(--lc-text, #0f1a14) 25%, transparent); }

    .lc-summary-card {
      padding: 12px 16px;
      border-radius: var(--lc-radius-sm, 12px);
      border: 1px solid color-mix(in srgb, var(--lc-primary-bg, #1B4332) 15%, transparent);
      background: color-mix(in srgb, var(--lc-primary-bg, #1B4332) 4%, var(--lc-bg, #ffffff));
      margin-bottom: 20px;
      font-size: 13px;
      color: var(--lc-text, #0f1a14);
    }
    .lc-summary-card .lc-summary-date { font-weight: 600; margin-bottom: 2px; }
    .lc-summary-card .lc-summary-time { color: color-mix(in srgb, var(--lc-text, #0f1a14) 55%, transparent); }

    .lc-step-title { font-size: 17px; font-weight: 600; margin-bottom: 16px; color: var(--lc-text, #0f1a14); }

    .lc-nav { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 16px; border-top: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 8%, transparent); }

    .lc-timezone { font-size: 12px; color: color-mix(in srgb, var(--lc-text, #0f1a14) 40%, transparent); margin-top: 12px; }
    .lc-success { text-align: center; padding: 40px 20px; }
    .lc-success-icon {
      width: 48px; height: 48px; border-radius: 50%;
      background: color-mix(in srgb, #16a34a 8%, var(--lc-bg, #ffffff));
      margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;
    }
    .lc-success-icon svg { width: 24px; height: 24px; color: #16a34a; }
    .lc-loading {
      display: flex; align-items: center; justify-content: center; padding: 40px;
      color: color-mix(in srgb, var(--lc-text, #0f1a14) 45%, transparent); font-size: 14px;
    }
    .lc-month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .lc-month-nav button {
      background: none;
      border: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 12%, transparent);
      border-radius: calc(var(--lc-radius-sm, 12px) - 4px);
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      color: var(--lc-text, #0f1a14);
    }
    .lc-month-nav button:hover { background: color-mix(in srgb, var(--lc-text, #0f1a14) 5%, var(--lc-bg, #ffffff)); }
    .lc-month-title { font-size: 15px; font-weight: 600; color: var(--lc-text, #0f1a14); }

    .lc-event-list { display: flex; flex-direction: column; gap: 10px; }
    .lc-event-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px;
      border: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 10%, transparent);
      border-radius: var(--lc-radius, 16px);
      cursor: pointer; transition: all 0.15s;
    }
    .lc-event-item:hover { border-color: var(--lc-primary-bg, #1B4332); background: color-mix(in srgb, var(--lc-primary-bg, #1B4332) 3%, var(--lc-bg, #ffffff)); }
    .lc-event-name { font-size: 15px; font-weight: 600; color: var(--lc-text, #0f1a14); }
    .lc-event-duration { font-size: 13px; color: color-mix(in srgb, var(--lc-text, #0f1a14) 45%, transparent); margin-top: 2px; }
    .lc-event-arrow { color: color-mix(in srgb, var(--lc-text, #0f1a14) 45%, transparent); }

    .lc-rating { display: inline-flex; gap: 4px; }
    .lc-rating button { background: none; border: none; padding: 4px; font-size: 24px; line-height: 1; color: color-mix(in srgb, var(--lc-text, #0f1a14) 15%, transparent); transition: color 0.1s; }
    .lc-rating button.filled { color: #f59e0b; }
    .lc-rating button:hover { color: #f59e0b; }

    .lc-checkbox-group, .lc-radio-group { display: flex; flex-direction: column; gap: 8px; }
    .lc-checkbox-label, .lc-radio-label { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; color: var(--lc-text, #0f1a14); }
    .lc-checkbox-label input, .lc-radio-label input { accent-color: var(--lc-primary-bg, #1B4332); }

    .lc-select {
      width: 100%; height: 40px; padding: 0 12px;
      border: 1px solid color-mix(in srgb, var(--lc-text, #0f1a14) 12%, transparent);
      border-radius: var(--lc-radius-sm, 12px);
      font-size: 14px; font-family: inherit; outline: none;
      background: var(--lc-bg, #ffffff);
      color: var(--lc-text, #0f1a14);
      transition: border-color 0.15s, box-shadow 0.15s;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%235c7268' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
    }
    .lc-select:focus {
      border-color: var(--lc-primary-bg, #1B4332);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--lc-primary-bg, #1B4332) 15%, transparent);
    }

    .lc-powered { text-align: center; margin-top: 16px; font-size: 11px; color: color-mix(in srgb, var(--lc-text, #0f1a14) 35%, transparent); }
    .lc-powered a { color: color-mix(in srgb, var(--lc-text, #0f1a14) 50%, transparent); text-decoration: none; font-weight: 500; }
    .lc-powered a:hover { text-decoration: underline; }
  `;
}
