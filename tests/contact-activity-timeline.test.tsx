/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ContactActivityTimeline } from "../src/components/ContactActivityTimeline";
import type {
  ContactActivityPage,
  ContactTimelineItem,
} from "../src/lib/contact-activity";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function page(
  activities: ContactTimelineItem[],
  nextCursor: string | null = null,
): ContactActivityPage {
  return {
    activities,
    counts: { all: 7, bookings: 2, formResponses: 2, workflows: 2 },
    nextCursor,
  };
}

const booking: ContactTimelineItem = {
  id: "booking:b1",
  kind: "booking",
  category: "bookings",
  occurredAt: "2026-07-01T10:00:00.000Z",
  title: "Product demo",
  description: "Booking created",
  status: "confirmed",
  bookingId: "b1",
  eventTypeId: "event-1",
  startTime: "2026-07-02T10:00:00.000Z",
  endTime: "2026-07-02T10:30:00.000Z",
  timezone: "UTC",
  meetingUrl: null,
  formResponseId: null,
};

const response: ContactTimelineItem = {
  id: "form_response:r1",
  kind: "form_response",
  category: "form_responses",
  occurredAt: "2026-07-01T11:00:00.000Z",
  title: "Lead form",
  description: "Submitted by ada@example.com",
  status: "completed",
  responseId: "r1",
  formId: "form-1",
};

const workflowRun: ContactTimelineItem = {
  id: "workflow_run:run-1",
  kind: "workflow_run",
  category: "workflows",
  occurredAt: "2026-07-01T12:00:00.000Z",
  title: "Qualify lead",
  description: "Workflow run",
  status: "completed",
  runId: "run-1",
  workflowId: "workflow-1",
};

const research: ContactTimelineItem = {
  id: "research:a1",
  kind: "research",
  category: "workflows",
  occurredAt: "2026-07-01T13:00:00.000Z",
  title: "Lead research completed",
  description: "Strong fit",
  status: "completed",
  research: {
    resultKey: "lead",
    provider: "gemini",
    model: "gemini-2.5-flash",
    prompt: "Research Ada",
    executedAt: "2026-07-01T13:00:00.000Z",
    result: {
      summary: "Strong fit",
      company: "Analytical Engines",
      role: "Founder",
      insights: ["Interested in automation"],
      sources: [{ title: "Company site", url: "https://example.com" }],
    },
  },
};

const generic: ContactTimelineItem = {
  id: "activity:a2",
  kind: "generic",
  category: "all",
  occurredAt: "2026-07-01T09:00:00.000Z",
  title: "Tag added",
  description: "Qualified",
  status: null,
  activityType: "tag_added",
};

function renderTimeline(
  fetchImplementation: typeof fetch,
  onSummaryChange = mock(() => {}),
) {
  globalThis.fetch = fetchImplementation;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ContactActivityTimeline
        projectId="p1"
        contactId="c1"
        contact={{ name: "Ada Lovelace", email: "ada@example.com" }}
        onSummaryChange={onSummaryChange}
      />
    </QueryClientProvider>,
  );
  return { queryClient, onSummaryChange };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ContactActivityTimeline", () => {
  test("owns the request, renders the four right-aligned segments, and reports counts", async () => {
    const fetchMock = mock(async () => jsonResponse(page([])));
    const { onSummaryChange } = renderTimeline(fetchMock as typeof fetch);

    expect(screen.getByRole("tab", { name: "All" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Bookings" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Form responses" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Workflows" })).not.toBeNull();
    expect(screen.getByRole("tablist").className).toContain("ml-auto");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/projects/p1/contacts/c1/activities?category=all&limit=20",
    );
    await waitFor(() =>
      expect(onSummaryChange).toHaveBeenCalledWith({
        status: "ready",
        counts: { all: 7, bookings: 2, formResponses: 2, workflows: 2 },
      }),
    );
  });

  test("filters through a separate query and loads the next cursor page", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("category=bookings") && url.includes("cursor=cursor-1")) {
        return jsonResponse(
          page([
            {
              ...booking,
              id: "booking:b2",
              bookingId: "b2",
              title: "Follow-up call",
            },
          ]),
        );
      }
      if (url.includes("category=bookings")) {
        return jsonResponse(page([booking], "cursor-1"));
      }
      return jsonResponse(page([]));
    });
    renderTimeline(fetchMock as typeof fetch);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Bookings" }), {
      button: 0,
      ctrlKey: false,
    });
    await screen.findByText("Product demo");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Follow-up call");

    expect(requestedUrls.some((url) => url.includes("category=bookings"))).toBe(true);
    expect(
      requestedUrls.some(
        (url) => url.includes("category=bookings") && url.includes("cursor=cursor-1"),
      ),
    ).toBe(true);
  });

  test("opens booking and form response items with their existing detail routes", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/bookings/b1")) {
        return jsonResponse({
          booking: {
            id: "b1",
            name: "Ada Lovelace",
            email: "ada@example.com",
            notes: null,
            startTime: booking.startTime,
            endTime: booking.endTime,
            timezone: "UTC",
            status: "confirmed",
            country: null,
            city: null,
            expiresAt: null,
            formResponseId: null,
            createdAt: booking.occurredAt,
          },
          eventTypeName: "Product demo",
          formFields: [],
        });
      }
      if (url.endsWith("/forms/form-1/responses/r1")) {
        return jsonResponse({ response: { ...response, id: "r1", values: [] } });
      }
      return jsonResponse(page([booking, response]));
    });
    renderTimeline(fetchMock as typeof fetch);
    await screen.findByText("Product demo");

    fireEvent.click(screen.getByText("Product demo").closest("button")!);
    await waitFor(() =>
      expect(requestedUrls.some((url) => url.endsWith("/bookings/b1"))).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByText("Lead form").closest("button")!);
    await waitFor(() =>
      expect(
        requestedUrls.some((url) => url.endsWith("/forms/form-1/responses/r1")),
      ).toBe(true),
    );
  });

  test("opens workflow run and research details while generic history stays static", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workflows/workflow-1/runs/run-1")) {
        return jsonResponse({
          run: {
            id: "run-1",
            workflowId: "workflow-1",
            workflowName: "Qualify lead",
            status: "completed",
            startedAt: "2026-07-01T12:00:00.000Z",
            completedAt: "2026-07-01T12:00:01.000Z",
            error: null,
            stepLogs: [
              {
                stepIndex: 0,
                stepType: "send_email",
                stepLabel: "Send email",
                status: "completed",
                input: null,
                output: { sent: true },
                error: null,
                startedAt: "2026-07-01T12:00:00.000Z",
                completedAt: "2026-07-01T12:00:01.000Z",
              },
            ],
          },
        });
      }
      return jsonResponse(page([research, workflowRun, generic]));
    });
    renderTimeline(fetchMock as typeof fetch);
    await screen.findByText("Qualify lead");

    expect(screen.getByText("Tag added").closest("button")).toBeNull();
    fireEvent.click(screen.getByText("Qualify lead").closest("button")!);
    expect(await screen.findByText("Send email")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByText("Lead research completed").closest("button")!);
    const researchDialog = screen.getByRole("dialog");
    expect(within(researchDialog).getByText("Strong fit")).not.toBeNull();
    expect(within(researchDialog).getByText("Analytical Engines")).not.toBeNull();
    expect(within(researchDialog).getByText("Interested in automation")).not.toBeNull();
  });

  test("shows a retry action after the first page fails", async () => {
    let attempts = 0;
    const fetchMock = mock(async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "Nope" }, 500)
        : jsonResponse(page([]));
    });
    renderTimeline(fetchMock as typeof fetch);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(attempts).toBe(2));
  });
});
