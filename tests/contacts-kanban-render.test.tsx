import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ContactsKanban from "../src/pages/ContactsKanban";
import type { ViewContact, ViewTag } from "../src/lib/contacts-view";

const lead: ViewTag = { id: "lead", name: "Lead", color: "#6b7280" };

function renderKanban(
  contact: ViewContact,
  options: { pivotTagIds: string[]; showUntagged: boolean },
): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/app/projects/p/contacts"]}>
      <Routes>
        <Route
          path="/app/projects/:projectId/contacts"
          element={
            <ContactsKanban
              contacts={[contact]}
              allTags={[lead]}
              pivotTagIds={options.pivotTagIds}
              showUntagged={options.showUntagged}
              onStageChange={() => {}}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function contact(overrides: Partial<ViewContact> = {}): ViewContact {
  return {
    id: "c",
    name: "Contact",
    email: null,
    phone: null,
    createdAt: new Date().toISOString(),
    enteredAtByTagId: {},
    tags: [],
    ...overrides,
  };
}

describe("ContactsKanban stage timing", () => {
  test("renders time in stage from the real column tag", () => {
    const enteredAt = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const html = renderKanban(
      contact({
        tags: [lead],
        enteredAtByTagId: { lead: enteredAt },
      }),
      { pivotTagIds: ["lead"], showUntagged: false },
    );

    expect(html).toContain("6h in stage");
  });

  test("does not render time in stage in the Untagged column", () => {
    const html = renderKanban(
      contact({
        enteredAtByTagId: {
          lead: new Date(Date.now() - 6 * 3_600_000).toISOString(),
        },
      }),
      { pivotTagIds: ["lead"], showUntagged: true },
    );

    expect(html).not.toContain("in stage");
  });
});
