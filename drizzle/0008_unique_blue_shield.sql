ALTER TABLE `outreach_settings` ADD `daily_limit` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_settings` ADD `window_start` text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_settings` ADD `window_end` text DEFAULT '17:00' NOT NULL;