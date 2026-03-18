import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

interface Project {
  id: string;
  onboarded: boolean;
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { data: projects, isPending } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects ?? data;
    },
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return <Navigate to="/app/onboarding" replace />;
  }

  const hasOnboarded = projects.some((p) => p.onboarded);
  if (!hasOnboarded) {
    return <Navigate to="/app/onboarding" replace />;
  }

  return <>{children}</>;
}

export default OnboardingGuard;
