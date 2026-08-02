export const AUTH_REDIRECT_STORAGE_KEY = "linkycal.authRedirect";

interface AuthLocation {
  pathname: string;
  search: string;
}

export function authRedirectPath(
  location: AuthLocation,
  redirectToCurrent = false,
): string {
  if (!redirectToCurrent) return "/?show_auth=true";
  const params = new URLSearchParams({
    show_auth: "true",
    redirect: `${location.pathname}${location.search}`,
  });
  return `/?${params.toString()}`;
}

export function getSafeAuthRedirect(value: string | null | undefined): string {
  if (!value) {
    return "/app";
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  if (typeof window !== "undefined") {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return "/app";
    }
  }

  return "/app";
}

export function getStoredAuthRedirect(): string {
  if (typeof window === "undefined") return "/app";
  return getSafeAuthRedirect(window.sessionStorage.getItem(AUTH_REDIRECT_STORAGE_KEY));
}

export function storeAuthRedirect(value: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    AUTH_REDIRECT_STORAGE_KEY,
    getSafeAuthRedirect(value),
  );
}

export function clearStoredAuthRedirect(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(AUTH_REDIRECT_STORAGE_KEY);
}

export function resolveAuthRedirect(redirectTo: string | null | undefined): string {
  const storedRedirect = getStoredAuthRedirect();
  const safeRedirect = getSafeAuthRedirect(redirectTo);

  if (storedRedirect !== "/app" && safeRedirect === "/app") {
    return storedRedirect;
  }

  return safeRedirect;
}
