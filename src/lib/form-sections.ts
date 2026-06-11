// ─── Section display settings ────────────────────────────────────────────────
//
// Stored in the form_steps.settings JSON column — no schema migration needed.

export function sectionShowsFieldsTogether(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  return (settings as { groupFields?: unknown }).groupFields === true;
}
