import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { createTestDb } from "../support/test-db";

const PROJECT_ID = "project-contact-pipeline";
const LEAD_TAG_ID = "tag-lead";

describe("contact pipeline ordering", function () {
  test("due dates stay chronological across paginated stage results", async function () {
    const testDatabase = createTestDb();

    try {
      await testDatabase.db.insert(dbSchema.schema.users).values({
        id: "owner-contact-pipeline",
        name: "Pipeline Owner",
        email: "pipeline@example.com",
      });
      await testDatabase.db.insert(dbSchema.projects).values({
        id: PROJECT_ID,
        userId: "owner-contact-pipeline",
        name: "Pipeline Project",
        slug: "pipeline-project",
      });
      await testDatabase.db.insert(dbSchema.tags).values({
        id: LEAD_TAG_ID,
        projectId: PROJECT_ID,
        name: "Lead",
        color: "#ef4444",
      });

      const deadlineContacts = [
        {
          id: "contact-overdue-old",
          name: "Old overdue",
          deadline: new Date("2026-07-20T09:00:00.000Z"),
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
        },
        {
          id: "contact-overdue-recent",
          name: "Recent overdue",
          deadline: new Date("2026-07-28T09:00:00.000Z"),
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
        },
        {
          id: "contact-upcoming",
          name: "Upcoming",
          deadline: new Date("2026-07-30T09:00:00.000Z"),
          createdAt: new Date("2026-07-03T00:00:00.000Z"),
        },
        {
          id: "contact-undated-a",
          name: "Undated A",
          deadline: null,
          createdAt: new Date("2026-07-04T00:00:00.000Z"),
        },
        {
          id: "contact-undated-b",
          name: "Undated B",
          deadline: null,
          createdAt: new Date("2026-07-05T00:00:00.000Z"),
        },
      ] as const;

      await testDatabase.db.insert(dbSchema.contacts).values(
        deadlineContacts.map(function contactValues(contact) {
          return {
            id: contact.id,
            projectId: PROJECT_ID,
            name: contact.name,
            nextActionText:
              contact.id === "contact-undated-b" ? null : "Follow up",
            nextActionDeadline: contact.deadline,
            createdAt: contact.createdAt,
          };
        }),
      );
      await testDatabase.db.insert(dbSchema.contactTags).values(
        deadlineContacts.map(function stageAssignment(contact) {
          return {
            contactId: contact.id,
            tagId: LEAD_TAG_ID,
          };
        }),
      );

      const service = new ContactService(testDatabase.db);
      const sortOptions = {
        stageTagId: LEAD_TAG_ID,
        sort: "nextActionDeadline",
      } as Parameters<ContactService["listPage"]>[1];
      const first = await service.listPage(PROJECT_ID, sortOptions, {
        limit: 2,
        offset: 0,
      });
      const second = await service.listPage(PROJECT_ID, sortOptions, {
        limit: 2,
        offset: 2,
      });
      const third = await service.listPage(PROJECT_ID, sortOptions, {
        limit: 2,
        offset: 4,
      });

      expect(
        [first, second, third].flatMap(function contactIds(page) {
          return page.contacts.map(function contactId(contact) {
            return contact.id;
          });
        }),
      ).toEqual([
        "contact-overdue-old",
        "contact-overdue-recent",
        "contact-upcoming",
        "contact-undated-a",
        "contact-undated-b",
      ]);
    } finally {
      testDatabase.close();
    }
  });
});
