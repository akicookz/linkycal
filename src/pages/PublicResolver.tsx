import { useParams, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader } from "lucide-react";

import PublicBooking from "./PublicBooking";
import PublicForm from "./PublicForm";

type ResolveResult = {
  kind?: "event" | "form";
  // `projectSlug` redirects a renamed workspace; `slug` a renamed form/event.
  redirectTo?: { slug?: string; projectSlug?: string };
};

export default function PublicResolver() {
  const { projectSlug, slug } = useParams<{ projectSlug: string; slug: string }>();
  const location = useLocation();

  const { data, isLoading, isError } = useQuery<ResolveResult>({
    queryKey: ["public-resolve", projectSlug, slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/resolve/${projectSlug}/${slug}`);
      if (!res.ok) throw new Error("not_found");
      return res.json();
    },
    enabled: !!projectSlug && !!slug,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-1">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          This link may have been removed or is not currently active.
        </p>
      </div>
    );
  }

  if (data.redirectTo?.projectSlug && data.redirectTo.projectSlug !== projectSlug) {
    return (
      <Navigate
        to={`/${data.redirectTo.projectSlug}/${slug}${location.search}`}
        replace
      />
    );
  }

  if (data.redirectTo?.slug && data.redirectTo.slug !== slug) {
    return (
      <Navigate
        to={`/${projectSlug}/${data.redirectTo.slug}${location.search}`}
        replace
      />
    );
  }

  return data.kind === "form" ? <PublicForm /> : <PublicBooking />;
}
