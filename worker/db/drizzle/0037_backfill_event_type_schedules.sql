INSERT INTO `schedules` (
	`id`,
	`project_id`,
	`name`,
	`timezone`,
	`is_default`,
	`created_at`,
	`updated_at`
)
SELECT
	'mcp-backfill-schedule-' || `event_types`.`id`,
	`event_types`.`project_id`,
	'Working Hours',
	'America/New_York',
	0,
	unixepoch(),
	unixepoch()
FROM `event_types`
WHERE `event_types`.`schedule_id` IS NULL;
--> statement-breakpoint
WITH `weekdays`(`day_of_week`) AS (
	VALUES (1), (2), (3), (4), (5)
)
INSERT INTO `availability_rules` (
	`id`,
	`schedule_id`,
	`day_of_week`,
	`start_time`,
	`end_time`,
	`created_at`
)
SELECT
	'mcp-backfill-rule-' || `weekdays`.`day_of_week` || '-' || `event_types`.`id`,
	'mcp-backfill-schedule-' || `event_types`.`id`,
	`weekdays`.`day_of_week`,
	'09:00',
	'17:00',
	unixepoch()
FROM `event_types`
CROSS JOIN `weekdays`
WHERE `event_types`.`schedule_id` IS NULL;
--> statement-breakpoint
UPDATE `event_types`
SET
	`schedule_id` = 'mcp-backfill-schedule-' || `id`,
	`updated_at` = unixepoch()
WHERE `schedule_id` IS NULL;
