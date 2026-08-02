CREATE TABLE `entitlement_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_type` text NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`entitlement_key` text NOT NULL,
	`outcome` text NOT NULL,
	`channel` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entitlement_outcomes_workspace_created_idx` ON `entitlement_outcomes` (`workspace_type`,`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `entitlement_outcomes_project_created_idx` ON `entitlement_outcomes` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_custom_css` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_css` text NOT NULL,
	`compiled_css` text NOT NULL,
	`source_bytes` integer DEFAULT 0 NOT NULL,
	`updated_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_custom_css_project_unique` ON `project_custom_css` (`project_id`);--> statement-breakpoint
CREATE TABLE `stored_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_type` text NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`object_key` text NOT NULL,
	`category` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stored_objects_object_key_unique` ON `stored_objects` (`object_key`);--> statement-breakpoint
CREATE INDEX `stored_objects_workspace_idx` ON `stored_objects` (`workspace_type`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `stored_objects_project_idx` ON `stored_objects` (`project_id`);--> statement-breakpoint
CREATE TABLE `workspace_storage_totals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_type` text NOT NULL,
	`workspace_id` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_storage_totals_workspace_unique` ON `workspace_storage_totals` (`workspace_type`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `workspace_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`usage_period_id` text NOT NULL,
	`workspace_type` text NOT NULL,
	`workspace_id` text NOT NULL,
	`entitlement_key` text NOT NULL,
	`operation_id` text NOT NULL,
	`amount` integer NOT NULL,
	`state` text DEFAULT 'reserved' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`usage_period_id`) REFERENCES `workspace_usage_periods`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_usage_events_operation_unique` ON `workspace_usage_events` (`workspace_type`,`workspace_id`,`entitlement_key`,`operation_id`);--> statement-breakpoint
CREATE INDEX `workspace_usage_events_period_state_idx` ON `workspace_usage_events` (`usage_period_id`,`state`);--> statement-breakpoint
CREATE TABLE `workspace_usage_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_type` text NOT NULL,
	`workspace_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`form_responses` integer DEFAULT 0 NOT NULL,
	`bookings` integer DEFAULT 0 NOT NULL,
	`workflow_executions` integer DEFAULT 0 NOT NULL,
	`transactional_emails` integer DEFAULT 0 NOT NULL,
	`integration_requests` integer DEFAULT 0 NOT NULL,
	`enrichments` integer DEFAULT 0 NOT NULL,
	`superseded_at` integer,
	`superseded_by_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_usage_periods_workspace_start_unique` ON `workspace_usage_periods` (`workspace_type`,`workspace_id`,`period_start`);--> statement-breakpoint
CREATE INDEX `workspace_usage_periods_workspace_end_idx` ON `workspace_usage_periods` (`workspace_type`,`workspace_id`,`period_end`);--> statement-breakpoint
CREATE TABLE `entitlement_resource_locks` (
	`lock_key` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entitlement_resource_locks_expiry_idx` ON `entitlement_resource_locks` (`expires_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `usage_recorded_at` integer;--> statement-breakpoint
UPDATE `bookings` SET `usage_recorded_at` = CASE WHEN typeof(`created_at`) = 'integer' THEN `created_at` ELSE unixepoch(`created_at`) END WHERE `usage_recorded_at` IS NULL;--> statement-breakpoint
ALTER TABLE `form_responses` ADD `usage_recorded_at` integer;--> statement-breakpoint
UPDATE `form_responses` SET `usage_recorded_at` = CASE WHEN typeof(`updated_at`) = 'integer' THEN `updated_at` ELSE unixepoch(`updated_at`) END WHERE `status` = 'completed' AND `usage_recorded_at` IS NULL;--> statement-breakpoint
UPDATE `workspace_usage_periods` AS `usage_period` SET `bookings` = `bookings` + (
	SELECT count(*) FROM `bookings`
	INNER JOIN `event_types` ON `event_types`.`id` = `bookings`.`event_type_id`
	INNER JOIN `projects` ON `projects`.`id` = `event_types`.`project_id`
	WHERE `bookings`.`usage_recorded_at` >= `usage_period`.`period_start`
		AND `bookings`.`usage_recorded_at` < `usage_period`.`period_end`
		AND ((`usage_period`.`workspace_type` = 'team' AND `projects`.`team_id` = `usage_period`.`workspace_id`)
			OR (`usage_period`.`workspace_type` = 'personal' AND `projects`.`team_id` IS NULL AND `projects`.`user_id` = `usage_period`.`workspace_id`))
);--> statement-breakpoint
UPDATE `workspace_usage_periods` AS `usage_period` SET `form_responses` = `form_responses` + (
	SELECT count(*) FROM `form_responses`
	INNER JOIN `forms` ON `forms`.`id` = `form_responses`.`form_id`
	INNER JOIN `projects` ON `projects`.`id` = `forms`.`project_id`
	WHERE `form_responses`.`status` = 'completed'
		AND `form_responses`.`usage_recorded_at` >= `usage_period`.`period_start`
		AND `form_responses`.`usage_recorded_at` < `usage_period`.`period_end`
		AND ((`usage_period`.`workspace_type` = 'team' AND `projects`.`team_id` = `usage_period`.`workspace_id`)
			OR (`usage_period`.`workspace_type` = 'personal' AND `projects`.`team_id` IS NULL AND `projects`.`user_id` = `usage_period`.`workspace_id`))
);--> statement-breakpoint
ALTER TABLE `projects` ADD `deleting_at` integer;
