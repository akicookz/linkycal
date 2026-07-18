ALTER TABLE `contacts` ADD `next_action_text` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `next_action_deadline` integer;--> statement-breakpoint
CREATE INDEX `contact_activity_stage_entry_idx` ON `contact_activity` (`contact_id`,`type`,`reference_id`,`created_at`);