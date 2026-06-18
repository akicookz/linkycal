CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teams_owner_user_id_idx` ON `teams` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_slug_idx` ON `teams` (`slug`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`invited_by_user_id` text,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `team_members_team_id_idx` ON `team_members` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_members_user_id_idx` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_team_user_idx` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`team_member_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_members_project_id_idx` ON `project_members` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_members_team_member_id_idx` ON `project_members` (`team_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_project_team_member_idx` ON `project_members` (`project_id`,`team_member_id`);--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`email` text NOT NULL,
	`team_role` text DEFAULT 'member' NOT NULL,
	`project_id` text,
	`project_role` text,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_invites_team_id_idx` ON `team_invites` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_invites_email_idx` ON `team_invites` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_token_hash_idx` ON `team_invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `team_calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `calendar_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_calendar_connections_team_id_idx` ON `team_calendar_connections` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_calendar_connections_connection_id_idx` ON `team_calendar_connections` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_calendar_connections_team_connection_idx` ON `team_calendar_connections` (`team_id`,`connection_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `team_id` text REFERENCES `teams`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `projects_team_id_idx` ON `projects` (`team_id`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD COLUMN `team_id` text REFERENCES `teams`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `subscriptions_team_id_idx` ON `subscriptions` (`team_id`);--> statement-breakpoint
INSERT INTO `teams` (`id`, `owner_user_id`, `name`, `slug`, `created_at`, `updated_at`)
SELECT
	'team_' || `id`,
	`id`,
	CASE
		WHEN `name` IS NULL OR trim(`name`) = '' THEN 'Personal Team'
		ELSE `name` || '''s Team'
	END,
	'team-' || lower(hex(randomblob(8))),
	unixepoch(),
	unixepoch()
FROM `users`;--> statement-breakpoint
INSERT INTO `team_members` (`id`, `team_id`, `user_id`, `role`, `joined_at`, `created_at`, `updated_at`)
SELECT
	'tm_' || `id`,
	'team_' || `id`,
	`id`,
	'owner',
	unixepoch(),
	unixepoch(),
	unixepoch()
FROM `users`;--> statement-breakpoint
UPDATE `projects`
SET `team_id` = (
	SELECT `teams`.`id`
	FROM `teams`
	WHERE `teams`.`owner_user_id` = `projects`.`user_id`
	LIMIT 1
)
WHERE `team_id` IS NULL;--> statement-breakpoint
UPDATE `subscriptions`
SET `team_id` = (
	SELECT `teams`.`id`
	FROM `teams`
	WHERE `teams`.`owner_user_id` = `subscriptions`.`user_id`
	LIMIT 1
)
WHERE `team_id` IS NULL;--> statement-breakpoint
INSERT INTO `team_calendar_connections` (`id`, `team_id`, `connection_id`, `created_by_user_id`, `created_at`)
SELECT
	'tcc_' || `calendar_connections`.`id`,
	`teams`.`id`,
	`calendar_connections`.`id`,
	`calendar_connections`.`user_id`,
	unixepoch()
FROM `calendar_connections`
INNER JOIN `teams` ON `teams`.`owner_user_id` = `calendar_connections`.`user_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_team_id_unique` ON `subscriptions` (`team_id`);
