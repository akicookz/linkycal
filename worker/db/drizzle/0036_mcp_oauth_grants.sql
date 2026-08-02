CREATE TABLE `mcp_oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcp_oauth_grants_project_id_idx` ON `mcp_oauth_grants` (`project_id`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_grants_user_id_idx` ON `mcp_oauth_grants` (`user_id`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_grants_client_id_idx` ON `mcp_oauth_grants` (`client_id`);
