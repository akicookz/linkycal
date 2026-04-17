-- Conditional form fields/steps and per-step workflow gating
ALTER TABLE form_fields ADD COLUMN visibility TEXT;
--> statement-breakpoint
ALTER TABLE form_fields ADD COLUMN query_param TEXT;
--> statement-breakpoint
ALTER TABLE form_steps ADD COLUMN visibility TEXT;
--> statement-breakpoint
ALTER TABLE workflow_steps ADD COLUMN condition TEXT;
