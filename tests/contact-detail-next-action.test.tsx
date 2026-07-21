/// <reference lib="dom" />

import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ContactDetailPage from "../src/pages/ContactDetail";

function renderContactDetail(
  nextActionText: string | null,
  nextActionDeadline: string | null,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["projects", "p1", "contacts", "c1"], {
    id: "c1",
    projectId: "p1",
    name: "Atul Shah",
    email: "atul@example.com",
    phone: null,
    notes: null,
    metadata: null,
    company: null,
    companyWebsite: null,
    position: null,
    companySize: null,
    estimatedRevenue: null,
    linkedinUrl: null,
    nextActionText,
    nextActionDeadline,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    tags: [],
    activity: [],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/projects/p1/contacts/c1"]}>
        <Routes>
          <Route
            path="/app/projects/:projectId/contacts/:contactId"
            element={<ContactDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("opens the natural-language Next Action composer", () => {
  renderContactDetail(null, null);

  fireEvent.click(screen.getByRole("button", { name: "Add Next Action" }));
  expect(
    screen.getByLabelText("What should happen, and when?"),
  ).not.toBeNull();
});

test("renders an undated Next Action", () => {
  renderContactDetail("Follow up", null);

  expect(screen.getByText("Follow up")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Mark Done" })).not.toBeNull();
  expect(screen.queryByText(/^(?:Due|Overdue)/)).toBeNull();
});
