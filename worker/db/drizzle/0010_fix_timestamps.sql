-- Convert all text timestamps to unix epoch integers
-- SQLite's unixepoch() converts "YYYY-MM-DD HH:MM:SS" text to integer seconds

-- projects
UPDATE `projects` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `projects` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- event_types
UPDATE `event_types` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `event_types` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- schedules
UPDATE `schedules` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `schedules` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- availability_rules
UPDATE `availability_rules` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- schedule_overrides
UPDATE `schedule_overrides` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- contacts
UPDATE `contacts` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `contacts` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- bookings
UPDATE `bookings` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `bookings` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint
UPDATE `bookings` SET `start_time` = unixepoch(`start_time`) WHERE typeof(`start_time`) = 'text';
--> statement-breakpoint
UPDATE `bookings` SET `end_time` = unixepoch(`end_time`) WHERE typeof(`end_time`) = 'text';
--> statement-breakpoint
UPDATE `bookings` SET `expires_at` = unixepoch(`expires_at`) WHERE typeof(`expires_at`) = 'text';
--> statement-breakpoint

-- forms
UPDATE `forms` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `forms` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- form_fields
UPDATE `form_fields` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- form_responses
UPDATE `form_responses` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `form_responses` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- contact_activity
UPDATE `contact_activity` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- tags
UPDATE `tags` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- workflows
UPDATE `workflows` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `workflows` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- workflow_steps
UPDATE `workflow_steps` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- workflow_runs
UPDATE `workflow_runs` SET `started_at` = unixepoch(`started_at`) WHERE typeof(`started_at`) = 'text';
--> statement-breakpoint
UPDATE `workflow_runs` SET `completed_at` = unixepoch(`completed_at`) WHERE typeof(`completed_at`) = 'text';
--> statement-breakpoint

-- subscriptions
UPDATE `subscriptions` SET `current_period_start` = unixepoch(`current_period_start`) WHERE typeof(`current_period_start`) = 'text';
--> statement-breakpoint
UPDATE `subscriptions` SET `current_period_end` = unixepoch(`current_period_end`) WHERE typeof(`current_period_end`) = 'text';
--> statement-breakpoint
UPDATE `subscriptions` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `subscriptions` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
--> statement-breakpoint

-- usage
UPDATE `usage` SET `period_start` = unixepoch(`period_start`) WHERE typeof(`period_start`) = 'text';
--> statement-breakpoint
UPDATE `usage` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- api_keys
UPDATE `api_keys` SET `last_used_at` = unixepoch(`last_used_at`) WHERE typeof(`last_used_at`) = 'text';
--> statement-breakpoint
UPDATE `api_keys` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint

-- calendar_connections
UPDATE `calendar_connections` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';
--> statement-breakpoint
UPDATE `calendar_connections` SET `updated_at` = unixepoch(`updated_at`) WHERE typeof(`updated_at`) = 'text';
