import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { ProjectEntitlementSnapshot } from "../../shared/plan-catalog";

export function useEntitlements(
  projectId: string,
): UseQueryResult<ProjectEntitlementSnapshot, Error> {
  return useQuery<ProjectEntitlementSnapshot, Error>({
    queryKey: ["projects", projectId, "entitlements"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/entitlements`);
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<ProjectEntitlementSnapshot>;
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to fetch project entitlements");
      }
      return body as ProjectEntitlementSnapshot;
    },
    enabled: Boolean(projectId),
  });
}

export type { ProjectEntitlementSnapshot };
