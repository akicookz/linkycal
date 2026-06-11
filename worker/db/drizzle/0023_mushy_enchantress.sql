CREATE TABLE `form_slug_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`form_id` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_slug_history_project_slug_idx` ON `form_slug_history` (`project_id`,`slug`);--> statement-breakpoint
CREATE INDEX `form_slug_history_form_id_idx` ON `form_slug_history` (`form_id`);