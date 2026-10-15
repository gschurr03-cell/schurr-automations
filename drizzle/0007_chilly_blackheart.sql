DROP INDEX `outreach_domain_idx`;--> statement-breakpoint
ALTER TABLE `outreach_prospects` ADD `import_identity` text;--> statement-breakpoint
ALTER TABLE `outreach_prospects` ADD `record_key` text;--> statement-breakpoint
ALTER TABLE `outreach_prospects` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_prospects` ADD `postal_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_import_identity_idx` ON `outreach_prospects` (`import_identity`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_record_key_idx` ON `outreach_prospects` (`record_key`);--> statement-breakpoint
CREATE INDEX `outreach_domain_idx` ON `outreach_prospects` (`domain`);