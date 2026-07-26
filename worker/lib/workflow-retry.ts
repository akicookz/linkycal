import { APICallError } from "ai";

export const MAX_WORKFLOW_ATTEMPTS = 3;
export const WORKFLOW_LEASE_MS = 15 * 60_000;

const SENSITIVE_ERROR_PATTERN =
  /authorization|bearer|api[-_\s]?key|token|secret|password|cookie/i;

interface ErrorRecord {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  transient?: unknown;
}

export class WorkflowFetchError extends TypeError {
  readonly cause: unknown;
  readonly transient = true;

  constructor(cause: unknown) {
    super("Provider request failed");
    this.name = "WorkflowFetchError";
    this.cause = cause;
  }
}

export function retryDelaySeconds(attempt: number): number | null {
  if (attempt === 1) return 15;
  if (attempt === 2) return 60;
  return null;
}

export function isTransientWorkflowError(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    return error.isRetryable;
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return true;
  }
  if (!isErrorRecord(error)) {
    return false;
  }
  if (error.transient === true) {
    return true;
  }

  const status = numericStatus(error);
  return (
    status === 408 ||
    status === 429 ||
    (status !== undefined && status >= 500 && status <= 599)
  );
}

export function isLeaseStale(
  leaseStartedAt: string | undefined,
  now: Date,
): boolean {
  if (!leaseStartedAt) return false;
  const startedAt = Date.parse(leaseStartedAt);
  return Number.isFinite(startedAt) && now.getTime() - startedAt >= WORKFLOW_LEASE_MS;
}

export function safeWorkflowErrorMessage(error: unknown): string {
  const status = isErrorRecord(error) ? numericStatus(error) : undefined;
  const stableStatusMessage = statusMessage(status);
  if (stableStatusMessage) {
    return stableStatusMessage;
  }

  const message =
    error instanceof Error
      ? error.message
      : isErrorRecord(error) && typeof error.message === "string"
        ? error.message
        : typeof error === "string"
          ? error
          : "";
  if (!message || SENSITIVE_ERROR_PATTERN.test(message)) {
    return "Provider request failed";
  }
  return message;
}

function isErrorRecord(error: unknown): error is ErrorRecord {
  return typeof error === "object" && error !== null;
}

function numericStatus(error: ErrorRecord): number | undefined {
  const value = error.statusCode ?? error.status ?? error.code;
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d{3}$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function statusMessage(status: number | undefined): string | undefined {
  if (status === 400 || status === 422) return "Provider request was invalid";
  if (status === 401 || status === 403) return "Provider authentication failed";
  if (status === 404) return "Provider resource was not found";
  if (status === 408) return "Provider request timed out";
  if (status === 429) return "Provider rate limit exceeded";
  if (status !== undefined && status >= 500 && status <= 599) {
    return "Provider service unavailable";
  }
  return undefined;
}
