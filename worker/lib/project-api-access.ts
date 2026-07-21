import type { ProjectRouteAccess } from "./api-route-policy";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProjectApiAccessInput {
  apiKeyProjectId: string;
  routeProjectId: string;
  routeAccess: ProjectRouteAccess;
  apiAccess: boolean;
}

export interface ProjectApiAccessFailure {
  status: 403;
  code:
    | "api_key_project_mismatch"
    | "api_key_route_forbidden"
    | "api_access_unavailable";
  error: string;
}

// ─── Authorization ──────────────────────────────────────────────────────────

export function authorizeApiKeyProjectRequest(
  input: ProjectApiAccessInput,
): ProjectApiAccessFailure | null {
  if (input.apiKeyProjectId !== input.routeProjectId) {
    return {
      status: 403,
      code: "api_key_project_mismatch",
      error: "API key does not belong to this project",
    };
  }

  if (input.routeAccess !== "apiKey") {
    return {
      status: 403,
      code: "api_key_route_forbidden",
      error: "API keys cannot access this route",
    };
  }

  if (!input.apiAccess) {
    return {
      status: 403,
      code: "api_access_unavailable",
      error: "API access requires a Pro or Business plan",
    };
  }

  return null;
}
