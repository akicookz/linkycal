import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { TagService } from "../../worker/services/tag-service";
import {
  applyProductionMigrations,
  createTestDb,
} from "../support/test-db";

const PROJECT_ID = "project-contact-pipeline";
const LEAD_TAG_ID = "tag-lead";
const FOLLOW_UP_TAG_ID = "tag-follow-up";
const VIP_TAG_ID = "tag-vip";
const PIPELINE_VIEW_ID = "view-sales-pipeline";

async function seedPipelineStageScenario(withConfiguredSteps: boolean) {
  const testDatabase = createTestDb();
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
  await testDatabase.db.insert(dbSchema.tags).values([
    {
      id: LEAD_TAG_ID,
      projectId: PROJECT_ID,
      name: "Lead",
      color: "#ef4444",
    },
    {
      id: FOLLOW_UP_TAG_ID,
      projectId: PROJECT_ID,
      name: "Follow up",
      color: "#f59e0b",
    },
    {
      id: VIP_TAG_ID,
      projectId: PROJECT_ID,
      name: "VIP",
      color: "#6366f1",
    },
  ]);
  await testDatabase.db.insert(dbSchema.contacts).values([
    {
      id: "contact-current",
      projectId: PROJECT_ID,
      name: "Current contact",
    },
    {
      id: "contact-legacy",
      projectId: PROJECT_ID,
      name: "Legacy contact",
    },
  ]);
  await testDatabase.db.insert(dbSchema.contactViews).values({
    id: PIPELINE_VIEW_ID,
    projectId: PROJECT_ID,
    name: "Sales pipeline",
    type: "kanban",
    config: withConfiguredSteps
      ? {
          pivotTagIds: [LEAD_TAG_ID, FOLLOW_UP_TAG_ID],
          showUntagged: true,
        }
      : { showUntagged: true },
  });
  return testDatabase;
}

async function contactTagIds(
  service: ContactService,
  contactId: string,
  projectId = PROJECT_ID,
): Promise<string[]> {
  return (await service.getContactTags(contactId, projectId))
    .map(function tagId(tag) {
      return tag.id;
    })
    .sort();
}

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

describe("contact pipeline stage persistence", function () {
  test("assigning a second pipeline step replaces the first and keeps ordinary tags", async function () {
    const testDatabase = await seedPipelineStageScenario(true);

    try {
      const tags = new TagService(testDatabase.db);
      const contacts = new ContactService(testDatabase.db);

      await tags.assignToContact(PROJECT_ID, "contact-current", VIP_TAG_ID);
      await tags.assignToContact(PROJECT_ID, "contact-current", LEAD_TAG_ID);
      await tags.assignToContact(
        PROJECT_ID,
        "contact-current",
        FOLLOW_UP_TAG_ID,
      );

      expect(await contactTagIds(contacts, "contact-current")).toEqual([
        FOLLOW_UP_TAG_ID,
        VIP_TAG_ID,
      ]);
    } finally {
      testDatabase.close();
    }
  });

  test("configuring pipeline steps reconciles existing duplicates to the newest assignment", async function () {
    const testDatabase = await seedPipelineStageScenario(false);

    try {
      await testDatabase.db.insert(dbSchema.contactTags).values([
        { contactId: "contact-legacy", tagId: LEAD_TAG_ID },
        { contactId: "contact-legacy", tagId: FOLLOW_UP_TAG_ID },
        { contactId: "contact-legacy", tagId: VIP_TAG_ID },
      ]);
      await testDatabase.db.insert(dbSchema.contactActivity).values([
        {
          id: "activity-lead-added",
          contactId: "contact-legacy",
          type: "tag_added",
          referenceId: LEAD_TAG_ID,
          createdAt: new Date("2026-07-20T09:00:00.000Z"),
        },
        {
          id: "activity-follow-up-added",
          contactId: "contact-legacy",
          type: "tag_added",
          referenceId: FOLLOW_UP_TAG_ID,
          createdAt: new Date("2026-07-28T09:00:00.000Z"),
        },
      ]);

      const contacts = new ContactService(testDatabase.db);
      await contacts.updateView(PROJECT_ID, PIPELINE_VIEW_ID, {
        config: {
          pivotTagIds: [LEAD_TAG_ID, FOLLOW_UP_TAG_ID],
          showUntagged: true,
        },
      });

      expect(await contactTagIds(contacts, "contact-legacy")).toEqual([
        FOLLOW_UP_TAG_ID,
        VIP_TAG_ID,
      ]);
    } finally {
      testDatabase.close();
    }
  });
});

describe("contact pipeline stage data migration", function () {
  test("existing normal and double-encoded pipelines keep only their newest assigned step", async function () {
    const testDatabase = createTestDb({
      through: "0033_persist_booking_calendar_identity.sql",
    });
    const projects = [
      {
        id: "project-migration-normal",
        slug: "migration-normal",
        tagPrefix: "normal",
        doubleEncoded: false,
      },
      {
        id: "project-migration-double",
        slug: "migration-double",
        tagPrefix: "double",
        doubleEncoded: true,
      },
    ] as const;

    try {
      await testDatabase.db.insert(dbSchema.schema.users).values({
        id: "owner-contact-migration",
        name: "Migration Owner",
        email: "migration@example.com",
      });

      for (const project of projects) {
        const leadTagId = `${project.tagPrefix}-lead`;
        const followUpTagId = `${project.tagPrefix}-follow-up`;
        const vipTagId = `${project.tagPrefix}-vip`;
        const contactId = `${project.tagPrefix}-contact`;
        const pipelineConfig = {
          pivotTagIds: [leadTagId, followUpTagId],
          showUntagged: true,
        };

        await testDatabase.db.insert(dbSchema.projects).values({
          id: project.id,
          userId: "owner-contact-migration",
          name: project.id,
          slug: project.slug,
        });
        await testDatabase.db.insert(dbSchema.tags).values([
          {
            id: leadTagId,
            projectId: project.id,
            name: "Lead",
            color: "#ef4444",
          },
          {
            id: followUpTagId,
            projectId: project.id,
            name: "Follow up",
            color: "#f59e0b",
          },
          {
            id: vipTagId,
            projectId: project.id,
            name: "VIP",
            color: "#6366f1",
          },
        ]);
        await testDatabase.db.insert(dbSchema.contacts).values({
          id: contactId,
          projectId: project.id,
          name: project.id,
        });
        await testDatabase.db.insert(dbSchema.contactViews).values({
          id: `${project.tagPrefix}-view`,
          projectId: project.id,
          name: "Sales pipeline",
          type: "kanban",
          config: project.doubleEncoded
            ? JSON.stringify(pipelineConfig)
            : pipelineConfig,
        });
        await testDatabase.db.insert(dbSchema.contactTags).values([
          { contactId, tagId: leadTagId },
          { contactId, tagId: followUpTagId },
          { contactId, tagId: vipTagId },
        ]);
        await testDatabase.db.insert(dbSchema.contactActivity).values([
          {
            id: `${project.tagPrefix}-lead-added`,
            contactId,
            type: "tag_added",
            referenceId: leadTagId,
            createdAt: new Date("2026-07-20T09:00:00.000Z"),
          },
          {
            id: `${project.tagPrefix}-follow-up-added`,
            contactId,
            type: "tag_added",
            referenceId: followUpTagId,
            createdAt: new Date("2026-07-28T09:00:00.000Z"),
          },
        ]);
      }

      applyProductionMigrations(testDatabase.sqlite, {
        after: "0033_persist_booking_calendar_identity.sql",
      });

      for (const project of projects) {
        const contacts = new ContactService(testDatabase.db);
        expect(
          await contactTagIds(
            contacts,
            `${project.tagPrefix}-contact`,
            project.id,
          ),
          project.id,
        ).toEqual([
          `${project.tagPrefix}-follow-up`,
          `${project.tagPrefix}-vip`,
        ]);
      }
    } finally {
      testDatabase.close();
    }
  });
});
