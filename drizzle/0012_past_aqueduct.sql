CREATE TABLE `retell_inbound_delays` (
	`call_id` text PRIMARY KEY NOT NULL,
	`ready_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `retell_inbound_delays_ready_idx` ON `retell_inbound_delays` (`ready_at`);