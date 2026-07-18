import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import PublicForm from "../src/pages/PublicForm";

function renderLoadingPublicForm(): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/acme/intake"]}>
        <Routes>
          <Route path="/:projectSlug/:slug" element={<PublicForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PublicForm loading render", () => {
  test("uses a neutral full-page loader without branding", () => {
    const html = renderLoadingPublicForm();

    expect(html).toContain("min-h-screen");
    expect(html).toContain("lucide-loader");
    expect(html).not.toContain("Powered by");
  });
});
