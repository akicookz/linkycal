import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./index.css";
import App from "./App.tsx";
import { queryClient } from "./lib/query-client";
import posthog from "posthog-js";
import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";

posthog.init("phc_pOgIt9tEObYYuDB8c8CuF6zaJFNOXZ2IlJkI8CoKuor", {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-01-30",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
            <ReactQueryDevtools initialIsOpen={false} />
          </BrowserRouter>
        </QueryClientProvider>
      </PostHogErrorBoundary>
    </PostHogProvider>
  </StrictMode>,
);
