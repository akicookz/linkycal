export interface BusyCalendarRef {
  connectionId: string;
  calendarId: string;
}

export function parseBusyCalendars(value: string | null | undefined): BusyCalendarRef[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: BusyCalendarRef[] = [];
  for (const raw of value.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const idx = entry.indexOf(":");
    if (idx <= 0 || idx === entry.length - 1) continue;
    const connectionId = entry.slice(0, idx);
    const calendarId = entry.slice(idx + 1);
    const key = `${connectionId}\u0000${calendarId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ connectionId, calendarId });
  }
  return out;
}

export function serializeBusyCalendars(refs: BusyCalendarRef[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const { connectionId, calendarId } of refs) {
    if (!connectionId || !calendarId) continue;
    if (connectionId.includes(",") || calendarId.includes(",")) continue;
    const key = `${connectionId}\u0000${calendarId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`${connectionId}:${calendarId}`);
  }
  return parts.join(",");
}

export function parseInviteConnectionIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function serializeInviteConnectionIds(ids: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || id.includes(",") || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.join(",");
}
