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
);
