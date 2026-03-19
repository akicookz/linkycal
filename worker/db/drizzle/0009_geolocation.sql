-- Add geolocation fields to bookings
ALTER TABLE `bookings` ADD COLUMN `ip_address` text;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `country` text;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `city` text;
--> statement-breakpoint

-- Add geolocation fields to form_responses
ALTER TABLE `form_responses` ADD COLUMN `ip_address` text;
--> statement-breakpoint
ALTER TABLE `form_responses` ADD COLUMN `country` text;
--> statement-breakpoint
ALTER TABLE `form_responses` ADD COLUMN `city` text;
