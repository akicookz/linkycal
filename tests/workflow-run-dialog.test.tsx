/// <reference lib="dom" />

import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { WorkflowRunDialog } from "../src/components/WorkflowRunDialog";
import { queryClient as appQueryClient } from "../src/lib/query-client";
import WorkflowBuilder from "../src/pages/WorkflowBuilder";

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
  appQueryClient.clear();
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

test("builder invalidates runs, activates Runs, and expands the exact returned run", async () => {
  let testRunStarted = false;
  let runsFetchCount = 0;
  const returnedRun = {
    id: "run-returned",
    workflowId: "workflow-1",
    triggerId: "contact-1",
    status: "completed",
    currentStepIndex: 0,
    startedAt: "2026-07-26T12:00:00.000Z",
    completedAt: "2026-07-26T12:00:01.000Z",
    error: null,
    stepLogs: [
      {
        stepIndex: 0,
        stepType: "ai_research",
        stepLabel: "Returned run expanded marker",
        status: "completed",
        input: null,
        output: null,
        error: null,
        startedAt: "2026-07-26T12:00:00.000Z",
        completedAt: "2026-07-26T12:00:01.000Z",
      },
    ],
  };
  const otherRun = {
    ...returnedRun,
    id: "run-other",
    stepLogs: [
      {
        ...returnedRun.stepLogs[0],
        stepLabel: "Other run hidden marker",
      },
    ],
  };
  const fetchMock = mock(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/workflows/workflow-1/runs?limit=50")) {
        runsFetchCount += 1;
        return jsonResponse({
          runs: testRunStarted ? [otherRun, returnedRun] : [],
        });
      }
      if (
        url.endsWith("/workflows/workflow-1/test") &&
        method === "POST"
      ) {
        testRunStarted = true;
        return jsonResponse({ success: true, runId: "run-returned" });
      }
      if (url.endsWith("/workflows/workflow-1")) {
        return jsonResponse({
          workflow: {
            id: "workflow-1",
            projectId: "project-1",
            name: "Research lead",
            trigger: "manual",
            triggerConfig: null,
            status: "active",
            createdAt: "2026-07-26T11:00:00.000Z",
            updatedAt: "2026-07-26T11:00:00.000Z",
            steps: [
              {
                id: "step-1",
                workflowId: "workflow-1",
                sortOrder: 0,
                type: "ai_research",
                config: {
                  provider: "chatgpt",
                  resultKey: "research",
                  prompt: "Research this contact",
                },
                condition: null,
                createdAt: "2026-07-26T11:00:00.000Z",
              },
            ],
          },
        });
      }
      if (url.endsWith("/contacts")) {
        return jsonResponse({
          contacts: [
            {
              id: "contact-1",
              name: "Ada Lovelace",
              email: "ada@example.com",
            },
          ],
        });
      }
      if (url.endsWith("/tags")) {
        return jsonResponse({ tags: [] });
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  globalThis.fetch = fetchMock as typeof fetch;
  appQueryClient.clear();

  render(
    <QueryClientProvider client={appQueryClient}>
      <MemoryRouter
        initialEntries={[
          "/app/projects/project-1/workflows/workflow-1",
        ]}
      >
        <Routes>
          <Route
            path="/app/projects/:projectId/workflows/:workflowId"
            element={<WorkflowBuilder />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findByDisplayValue("Research lead");
  await waitFor(() => {
    expect(runsFetchCount).toBe(1);
  });
  fireEvent.click(screen.getByRole("button", { name: "Test Run" }));
  fireEvent.keyDown(await screen.findByLabelText("Contact"), {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: /Ada Lovelace/ }));
  fireEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

  await waitFor(() => {
    expect(screen.getByRole("tab", { name: "Runs" }).getAttribute("data-state"))
      .toBe("active");
    expect(runsFetchCount).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Returned run expanded marker")).not.toBeNull();
  });
  expect(screen.queryByText("Other run hidden marker")).toBeNull();
});
