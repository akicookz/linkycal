const API_BASE = "__LINKYCAL_API_BASE__"; // replaced at build time or auto-detected

export function getApiBase(): string {
  // If replaced at build time, use that
  if (API_BASE && !API_BASE.startsWith("__")) {
    return API_BASE;
  }

  // Try to detect from script src
  const scripts = document.querySelectorAll("script[src]");
  for (const script of scripts) {
    const src = (script as HTMLScriptElement).src;
    if (src.includes("linkycal") || src.includes("widgets")) {
      try {
        const url = new URL(src);
        return url.origin;
      } catch {
        // ignore malformed URLs
      }
    }
  }

  return window.location.origin;
}

export async function fetchApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error: ${res.status}${body ? ` - ${body}` : ""}`);
  }
  return res.json();
}
