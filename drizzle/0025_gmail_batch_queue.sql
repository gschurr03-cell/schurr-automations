CREATE TABLE `gmail_queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_id` text NOT NULL,
	`outbox_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`batch_number` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`queue_id`) REFERENCES `gmail_queues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_queue_outbox_idx` ON `gmail_queue_items` (`outbox_id`);--> statement-breakpoint
CREATE INDEX `gmail_queue_items_batch_idx` ON `gmail_queue_items` (`queue_id`,`batch_number`,`status`);--> statement-breakpoint
CREATE TABLE `gmail_queues` (
	`id` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`mailbox` text NOT NULL,
	`active_key` text,
	`status` text DEFAULT 'active' NOT NULL,
	`interval_minutes` integer DEFAULT 45 NOT NULL,
	`batch_size` integer DEFAULT 5 NOT NULL,
	`next_due` integer NOT NULL,
	`last_batch_at` integer DEFAULT 0 NOT NULL,
	`current_batch` integer DEFAULT -1 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`confirmed_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_queue_active_mailbox_idx` ON `gmail_queues` (`active_key`);--> statement-breakpoint
CREATE INDEX `gmail_queue_due_idx` ON `gmail_queues` (`status`,`next_due`);