/// <reference lib="dom" />

import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { WorkflowRunDialog } from "../src/components/WorkflowRunDialog";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDialog(runResponse: unknown, onSuccess: (runId: string | null) => void) {
  const fetchMock = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/contacts")) {
      return jsonResponse({
        contacts: [{ id: "contact-1", name: "Ada Lovelace", email: "ada@example.com" }],
      });
    }
    if (url.endsWith("/test") || url.endsWith("/trigger")) {
      return jsonResponse(runResponse);
    }
    return jsonResponse({ error: "Unexpected request" });
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["projects", "project-1", "contacts", "workflow-runner"], [
    { id: "contact-1", name: "Ada Lovelace", email: "ada@example.com" },
  ]);
  render(
    <QueryClientProvider client={queryClient}>
      <WorkflowRunDialog
        open
        onOpenChange={() => undefined}
        projectId="project-1"
        workflowId="workflow-1"
        trigger="manual"
        workflowName="Research lead"
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("passes the persisted test run ID to the success callback", async () => {
  const onSuccess = mock(() => undefined);
  renderDialog({ success: true, runId: "run-123" }, onSuccess);

  fireEvent.keyDown(screen.getByLabelText("Contact"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /Ada Lovelace/ }));
  fireEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledWith("run-123");
  });
});

test("passes no run ID to the success callback for an audience run", async () => {
  const onSuccess = mock(() => undefined);
  renderDialog({ success: true, started: 4 }, onSuccess);

  fireEvent.keyDown(screen.getByLabelText("Run Mode"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Run for all matching contacts" }));
  fireEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledWith(null);
  });
});
