ALTER TABLE `outreach_prospects` ADD `source_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `outreach_activity_recipient_idx` ON `outreach_activity` (`recipient_email`,`kind`);