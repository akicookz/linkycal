PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_form_fields` (
	`id` text NOT NULL,
	`form_id` text NOT NULL,
	`step_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`placeholder` text,
	`required` integer DEFAULT false NOT NULL,
	`validation` text,
	`options` text,
	`visibility` text,
	`contact_mapping` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`form_id`, `id`),
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `form_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_form_fields`("id", "form_id", "step_id", "sort_order", "type", "label", "description", "placeholder", "required", "validation", "options", "visibility", "contact_mapping", "created_at")
  SELECT ff."id", fs."form_id", ff."step_id", ff."sort_order", ff."type", ff."label", ff."description", ff."placeholder", ff."required", ff."validation", ff."options", ff."visibility", ff."contact_mapping", ff."created_at"
  FROM `form_fields` ff
  INNER JOIN `form_steps` fs ON fs."id" = ff."step_id";
--> statement-breakpoint
DROP TABLE `form_fields`;--> statement-breakpoint
ALTER TABLE `__new_form_fields` RENAME TO `form_fields`;--> statement-breakpoint
CREATE INDEX `form_fields_step_id_idx` ON `form_fields` (`step_id`);--> statement-breakpoint
CREATE INDEX `form_fields_form_id_idx` ON `form_fields` (`form_id`);--> statement-breakpoint
CREATE TABLE `__new_form_field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`form_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text,
	`file_url` text,
	FOREIGN KEY (`response_id`) REFERENCES `form_responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_id`,`field_id`) REFERENCES `form_fields`(`form_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_form_field_values`("id", "response_id", "form_id", "field_id", "value", "file_url")
  SELECT fv."id", fv."response_id", fr."form_id", fv."field_id", fv."value", fv."file_url"
  FROM `form_field_values` fv
  INNER JOIN `form_responses` fr ON fr."id" = fv."response_id"
  WHERE fr."form_id" IS NOT NULL;
--> statement-breakpoint
DROP TABLE `form_field_values`;--> statement-breakpoint
ALTER TABLE `__new_form_field_values` RENAME TO `form_field_values`;--> statement-breakpoint
CREATE INDEX `form_field_values_response_id_idx` ON `form_field_values` (`response_id`);--> statement-breakpoint
CREATE INDEX `form_field_values_field_id_idx` ON `form_field_values` (`field_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
