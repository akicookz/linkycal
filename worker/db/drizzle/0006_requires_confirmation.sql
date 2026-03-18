-- Add requires_confirmation to event_types
ALTER TABLE `event_types` ADD COLUMN `requires_confirmation` integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Add expires_at to bookings for auto-decline
ALTER TABLE `bookings` ADD COLUMN `expires_at` integer;
