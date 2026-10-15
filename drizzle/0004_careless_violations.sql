CREATE TABLE `outreach_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`prospect_id` text,
	`campaign_id` text,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `outreach_prospects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`campaign_id`) REFERENCES `outreach_campaigns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_activity_date_idx` ON `outreach_activity` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `outreach_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`service` text NOT NULL,
	`audience` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`steps` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outreach_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`step` integer NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_at` text,
	`approved_revision` integer,
	`sender_revision` integer,
	`sent_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `outreach_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prospect_id`) REFERENCES `outreach_prospects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_draft_member_step_idx` ON `outreach_drafts` (`campaign_id`,`prospect_id`,`step`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_draft_email_step_idx` ON `outreach_drafts` (`campaign_id`,`recipient`,`step`);--> statement-breakpoint
CREATE INDEX `outreach_draft_status_idx` ON `outreach_drafts` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `outreach_prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`domain` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`service` text DEFAULT 'calls' NOT NULL,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`observed_at` text DEFAULT '' NOT NULL,
	`research` text DEFAULT '' NOT NULL,
	`contact_candidates` text DEFAULT '[]' NOT NULL,
	`import_source` text DEFAULT 'Manual entry' NOT NULL,
	`lead_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_domain_idx` ON `outreach_prospects` (`domain`);--> statement-breakpoint
CREATE INDEX `outreach_prospect_status_idx` ON `outreach_prospects` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `outreach_prospect_email_idx` ON `outreach_prospects` (`email`);--> statement-breakpoint
CREATE TABLE `outreach_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_name` text DEFAULT 'Gavin Schurr' NOT NULL,
	`sender_email` text DEFAULT '' NOT NULL,
	`postal_address` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outreach_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
