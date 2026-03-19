-- Add booking form reference to event types
ALTER TABLE `event_types` ADD COLUMN `booking_form_id` text REFERENCES `forms`(`id`) ON DELETE SET NULL;
--> statement-breakpoint

-- Add form response reference to bookings
ALTER TABLE `bookings` ADD COLUMN `form_response_id` text REFERENCES `form_responses`(`id`) ON DELETE SET NULL;
