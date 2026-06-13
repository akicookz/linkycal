CREATE TABLE `project_slug_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_slug_history_slug_idx` ON `project_slug_history` (`slug`);--> statement-breakpoint
CREATE INDEX `project_slug_history_project_id_idx` ON `project_slug_history` (`project_id`);