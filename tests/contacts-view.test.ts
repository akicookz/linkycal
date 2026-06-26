// tests/contacts-view.test.ts
import { describe, expect, test } from "bun:test";
import {
  buildKanbanColumns,
  contactStageTagId,
  compareContacts,
  type ViewContact,
  type ViewTag,
} from "../src/lib/contacts-view";

const tags: ViewTag[] = [
  { id: "lead", name: "Lead", color: "#6b7280" },
  { id: "prospect", name: "Prospect", color: "#3b82f6" },
  { id: "vip", name: "VIP", color: "#ec4899" },
];
const mk = (over: Partial<ViewContact>): ViewContact => ({
  id: "c", name: "C", email: null, phone: null, createdAt: "2026-01-01", tags: [], ...over,
});

describe("buildKanbanColumns", () => {
  test("orders columns by pivotTagIds and appends untagged", () => {
    const contacts = [
      mk({ id: "a", name: "A", tags: [{ ...tags[1] }] }),       // Prospect
      mk({ id: "b", name: "B", tags: [{ ...tags[0] }, { ...tags[2] }] }), // Lead + VIP
      mk({ id: "c", name: "C", tags: [] }),                     // none
    ];
    const cols = buildKanbanColumns({
      contacts,
      allTags: tags,
      pivotTagIds: ["prospect", "lead"],
      showUntagged: true,
    });
    expect(cols.map((c) => c.id)).toEqual(["prospect", "lead", "__untagged__"]);
    expect(cols[0].contacts.map((c) => c.id)).toEqual(["a"]);
    expect(cols[1].contacts.map((c) => c.id)).toEqual(["b"]);
    expect(cols[2].contacts.map((c) => c.id)).toEqual(["c"]);
  });

  test("falls back to all tags when no pivot, no untagged column", () => {
    const cols = buildKanbanColumns({ contacts: [], allTags: tags, pivotTagIds: null, showUntagged: false });
    expect(cols.map((c) => c.id)).toEqual(["lead", "prospect", "vip"]);
  });
});

describe("contactStageTagId", () => {
  test("returns first pivot tag the contact has", () => {
    const c = mk({ tags: [{ ...tags[2] }, { ...tags[1] }] });
    expect(contactStageTagId(c, ["lead", "prospect", "vip"])).toBe("prospect");
  });
  test("null when no pivot match", () => {
    expect(contactStageTagId(mk({ tags: [] }), ["lead"])).toBeNull();
  });
});

describe("compareContacts", () => {
  test("sorts by name asc/desc", () => {
    const a = mk({ id: "a", name: "Amanda" });
    const b = mk({ id: "b", name: "Carlos" });
    expect(compareContacts(a, b, "name", "asc", null, tags)).toBeLessThan(0);
    expect(compareContacts(a, b, "name", "desc", null, tags)).toBeGreaterThan(0);
  });
  test("sorts by stage using pivot order", () => {
    const a = mk({ id: "a", tags: [{ ...tags[1] }] }); // Prospect (index 1)
    const b = mk({ id: "b", tags: [{ ...tags[0] }] }); // Lead (index 0)
    expect(compareContacts(a, b, "stage", "asc", ["lead", "prospect"], tags)).toBeGreaterThan(0);
  });
  test("blank values sort last regardless of direction", () => {
    const withEmail = mk({ id: "a", email: "a@x.com" });
    const noEmail = mk({ id: "b", email: null });
    expect(compareContacts(withEmail, noEmail, "email", "asc", null, tags)).toBeLessThan(0);
    expect(compareContacts(withEmail, noEmail, "email", "desc", null, tags)).toBeLessThan(0);
  });
});
