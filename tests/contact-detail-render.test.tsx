import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ContactDetailPage from "../src/pages/ContactDetail";

interface ContactOverrides {
  nextActionText?: string | null;
  nextActionDeadline?: string | null;
}

function renderContactDetail(overrides: ContactOverrides = {}): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  queryClient.setQueryData(["projects", "p1", "contacts", "c1"], {
    id: "c1",
    projectId: "p1",
    name: "Atul Shah",
    email: "raj.shah@babylist.com",
    phone: null,
    notes: null,
    company: "Babylist",
    companyWebsite: "babylist.com",
    position: null,
    companySize: "201-500",
    estimatedRevenue: null,
    linkedinUrl: null,
    nextActionText: null,
    nextActionDeadline: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    tags: [{ id: "t1", name: "Follow Up", color: "#f59e0b" }],
    activity: [],
    metadata: {
      workflow: {
        research: {
          latest: {
            provider: "chatgpt",
            result: { summary: "This research summary should stay hidden." },
          },
        },
      },
    },
    ...overrides,
  });
  queryClient.setQueryData(["projects", "p1", "enrichment-usage"], {
    used: 1,
    limit: 10,
    remaining: 9,
    unlimited: false,
  });

  return renderToStaticMarkup(
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

describe("ContactDetail render", () => {
  test("places tag controls inside the contact identity", () => {
    const html = renderContactDetail();

    expect(html).toMatch(
      /data-contact-identity="true"[\s\S]*?Atul Shah[\s\S]*?data-contact-tags="inline"[\s\S]*?Follow Up[\s\S]*?Add Tag/,
    );
  });

  test("omits redundant contact, tags, and research card headings", () => {
    const html = renderContactDetail();

    expect(html).not.toContain("Contact Information");
    expect(html).not.toContain(">Tags<");
    expect(html).not.toContain("Latest Research");
    expect(html).not.toContain("This research summary should stay hidden.");
  });

  test("uses compact tag controls with a color-matched shadow ring", () => {
    const html = renderContactDetail();
    const tagClasses = html
      .match(/<button[^>]*class="([^"]*)"[^>]*title="Remove Follow Up tag"/)?.[1]
      .split(" ");
    const addTagClasses = html
      .match(/<button class="([^"]*)"[^>]*aria-haspopup="dialog"/)?.[1]
      .split(" ");

    expect(tagClasses).toContain("text-[11px]");
    expect(tagClasses).toContain("border-0");
    expect(tagClasses).toContain("ring-shadow");
    expect(html).toContain("--ring-shadow-color:#f59e0b");
    expect(addTagClasses).toContain("text-[11px]");
    expect(addTagClasses).toContain("gap-1.5");
  });

  test("renders an empty Next Action card before Quick Stats", () => {
    const html = renderContactDetail();

    expect(html).toMatch(
      /data-next-action-card="true"[\s\S]*?Next Action[\s\S]*?No next action[\s\S]*?Add Next Action[\s\S]*?Quick Stats/,
    );
  });

  test("renders a populated Next Action with edit and completion controls", () => {
    const html = renderContactDetail({
      nextActionText: "Send revised proposal",
      nextActionDeadline: "2026-07-25T14:30:00.000Z",
    });

    expect(html).toContain("Send revised proposal");
    expect(html).toContain("Edit");
    expect(html).toContain("Mark Done");
    expect(html).toMatch(/Due in|Overdue by/);
  });

  test("uses restrained destructive text for an overdue action", () => {
    const html = renderContactDetail({
      nextActionText: "Call procurement",
      nextActionDeadline: "2020-01-01T00:00:00.000Z",
    });

    expect(html).toMatch(/class="[^"]*text-destructive[^"]*"[^>]*>Overdue by/);
  });
});
