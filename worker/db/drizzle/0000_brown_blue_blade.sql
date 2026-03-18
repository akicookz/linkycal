CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`label` text,
	`last_used_at` integer,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_keys_project_id_idx` ON `api_keys` (`project_id`);--> statement-breakpoint
CREATE TABLE `availability_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `availability_rules_schedule_id_idx` ON `availability_rules` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type_id` text NOT NULL,
	`contact_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`notes` text,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`timezone` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`gcal_event_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`event_type_id`) REFERENCES `event_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookings_event_type_id_idx` ON `bookings` (`event_type_id`);--> statement-breakpoint
CREATE INDEX `bookings_contact_id_idx` ON `bookings` (`contact_id`);--> statement-breakpoint
CREATE INDEX `bookings_start_time_idx` ON `bookings` (`start_time`);--> statement-breakpoint
CREATE TABLE `calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'google' NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_connections_user_id_idx` ON `calendar_connections` (`user_id`);--> statement-breakpoint
CREATE TABLE `contact_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`type` text NOT NULL,
	`reference_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_activity_contact_id_idx` ON `contact_activity` (`contact_id`);--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`metadata` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_project_id_idx` ON `contacts` (`project_id`);--> statement-breakpoint
CREATE INDEX `contacts_email_idx` ON `contacts` (`email`);--> statement-breakpoint
CREATE TABLE `default_calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `calendar_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `default_calendars_connection_id_idx` ON `default_calendars` (`connection_id`);--> statement-breakpoint
CREATE TABLE `event_types` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`duration` integer DEFAULT 30 NOT NULL,
	`description` text,
	`location` text,
	`color` text DEFAULT '#3b82f6',
	`buffer_before` integer DEFAULT 0 NOT NULL,
	`buffer_after` integer DEFAULT 0 NOT NULL,
	`max_per_day` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_types_project_id_idx` ON `event_types` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_types_project_slug_idx` ON `event_types` (`project_id`,`slug`);--> statement-breakpoint
CREATE TABLE `form_field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text,
	`file_url` text,
	FOREIGN KEY (`response_id`) REFERENCES `form_responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `form_fields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_field_values_response_id_idx` ON `form_field_values` (`response_id`);--> statement-breakpoint
CREATE INDEX `form_field_values_field_id_idx` ON `form_field_values` (`field_id`);--> statement-breakpoint
CREATE TABLE `form_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`placeholder` text,
	`required` integer DEFAULT false NOT NULL,
	`validation` text,
	`options` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`step_id`) REFERENCES `form_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_fields_step_id_idx` ON `form_fields` (`step_id`);--> statement-breakpoint
CREATE TABLE `form_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`current_step_index` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`respondent_email` text,
	`metadata` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_responses_form_id_idx` ON `form_responses` (`form_id`);--> statement-breakpoint
CREATE TABLE `form_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`title` text,
	`description` text,
	`settings` text,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_steps_form_id_idx` ON `form_steps` (`form_id`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text DEFAULT 'single' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`settings` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `forms_project_id_idx` ON `forms` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_project_slug_idx` ON `forms` (`project_id`,`slug`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`onboarded` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_user_id_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_idx` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `schedule_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`is_blocked` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_overrides_schedule_id_idx` ON `schedule_overrides` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedules_project_id_idx` ON `schedules` (`project_id`);--> statement-breakpoint
CREATE TABLE `selected_calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`for_availability` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `calendar_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `selected_calendars_connection_id_idx` ON `selected_calendars` (`connection_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`interval` text DEFAULT 'monthly' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subscriptions_user_id_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_stripe_sub_id_idx` ON `subscriptions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6b7280',
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_project_id_idx` ON `tags` (`project_id`);--> statement-breakpoint
CREATE TABLE `usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`form_responses` integer DEFAULT 0 NOT NULL,
	`bookings_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_user_id_idx` ON `usage` (`user_id`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`trigger_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`current_step_index` integer DEFAULT 0 NOT NULL,
	`started_at` integer DEFAULT (current_timestamp) NOT NULL,
	`completed_at` integer,
	`error` text,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_runs_workflow_id_idx` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `workflow_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`config` text,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_steps_workflow_id_idx` ON `workflow_steps` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (current_timestamp) NOT NULL,
	`updated_at` integer DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflows_project_id_idx` ON `workflows` (`project_id`);