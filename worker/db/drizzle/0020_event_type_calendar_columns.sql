-- Add calendar-selection columns to event_types
ALTER TABLE `event_types` ADD COLUMN `busy_calendars` text;
--> statement-breakpoint
ALTER TABLE `event_types` ADD COLUMN `invite_connection_ids` text;
--> statement-breakpoint

-- Backfill busy_calendars from the old join table
UPDATE `event_types`
  SET `busy_calendars` = (
    SELECT group_concat(connection_id || ':' || calendar_id, ',')
    FROM `event_type_busy_calendars`
    WHERE `event_type_busy_calendars`.`event_type_id` = `event_types`.`id`
  );
--> statement-breakpoint

DROP TABLE IF EXISTS `event_type_busy_calendars`;
