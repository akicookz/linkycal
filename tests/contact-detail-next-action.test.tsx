/// <reference lib="dom" />

import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ContactDetailPage from "../src/pages/ContactDetail";

const originalFetch = globalThis.fetch;

function renderContactDetail(
  nextActionText: string | null,
  nextActionDeadline: string | null,
) {
  const fetchMock = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/projects/p1/contacts/c1/activities")) {
      return new Response(
        JSON.stringify({
          activities: [],
          counts: { all: 8, bookings: 3, formResponses: 4, workflows: 1 },
          nextCursor: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: "Unexpected request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });
  globalThis.fetch = fetchMock as typeof fetch;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
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
  return fetchMock;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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

test("loads activity separately and renders exact contact statistics", async () => {
  const fetchMock = renderContactDetail(null, null);

  const bookingRow = screen.getByText("Bookings", { selector: "span" }).parentElement?.parentElement;
  const responseRow = screen.getByText("Form Submissions").parentElement?.parentElement;
  expect(bookingRow).not.toBeNull();
  expect(responseRow).not.toBeNull();
  await waitFor(() => expect(within(bookingRow!).getByText("3")).not.toBeNull());
  expect(within(responseRow!).getByText("4")).not.toBeNull();
  expect(screen.getByText("8 events")).not.toBeNull();
  expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/contacts/c1/activities?category=all&limit=20"))).toBe(true);
});
