ALTER TABLE `event_types` ADD `max_per_week` integer;--> statement-breakpoint
ALTER TABLE `event_types` ADD `week_start` text DEFAULT 'monday' NOT NULL;