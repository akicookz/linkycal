-- Add per-event-type calendar destination columns
ALTER TABLE `event_types` ADD COLUMN `destination_connection_id` text REFERENCES `calendar_connections`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `event_types` ADD COLUMN `destination_calendar_id` text;
--> statement-breakpoint

-- Create event_type_busy_calendars junction table
CREATE TABLE `event_type_busy_calendars` (
  `id` text PRIMARY KEY NOT NULL,
  `event_type_id` text NOT NULL REFERENCES `event_types`(`id`) ON DELETE CASCADE,
  `connection_id` text NOT NULL REFERENCES `calendar_connections`(`id`) ON DELETE CASCADE,
  `calendar_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_type_busy_calendars_event_type_id_idx` ON `event_type_busy_calendars` (`event_type_id`);
--> statement-breakpoint

-- Drop unused tables
DROP TABLE IF EXISTS `selected_calendars`;
--> statement-breakpoint
DROP TABLE IF EXISTS `default_calendars`;
