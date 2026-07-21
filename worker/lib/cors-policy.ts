function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isTrustedOrigin(
  origin: string,
  configuredBaseUrl: string,
  requestUrl: string,
): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const configuredOrigin = normalizeOrigin(configuredBaseUrl);
  const requestOrigin = normalizeOrigin(requestUrl);
  return (
    normalizedOrigin === configuredOrigin || normalizedOrigin === requestOrigin
  );
}

export function sessionOriginAllowed(
  method: string,
  origin: string | undefined,
  configuredBaseUrl: string,
  requestUrl: string,
): boolean {
  if (!origin) return true;
  if (!method) return false;
  return isTrustedOrigin(origin, configuredBaseUrl, requestUrl);
}
