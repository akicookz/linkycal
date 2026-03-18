PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_form_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`placeholder` text,
	`required` integer DEFAULT false NOT NULL,
	`validation` text,
	`options` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`step_id`) REFERENCES `form_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_form_fields`("id", "step_id", "sort_order", "type", "label", "placeholder", "required", "validation", "options", "created_at") SELECT "id", "step_id", "sort_order", "type", "label", "placeholder", "required", "validation", "options", "created_at" FROM `form_fields`;--> statement-breakpoint
DROP TABLE `form_fields`;--> statement-breakpoint
ALTER TABLE `__new_form_fields` RENAME TO `form_fields`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `form_fields_step_id_idx` ON `form_fields` (`step_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_slug_unique_idx` ON `forms` (`slug`);