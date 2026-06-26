ALTER TABLE `contacts` ADD `company` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `company_website` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `position` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `company_size` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `estimated_revenue` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `linkedin_url` text;--> statement-breakpoint
ALTER TABLE `usage` ADD `enrichments_count` integer DEFAULT 0 NOT NULL;