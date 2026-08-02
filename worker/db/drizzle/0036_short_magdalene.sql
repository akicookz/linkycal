CREATE TABLE `entitlement_resource_locks` (
	`lock_key` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entitlement_resource_locks_expiry_idx` ON `entitlement_resource_locks` (`expires_at`);