CREATE TABLE `client_setup_previews` (
	`client_id` text NOT NULL,
	`recipe` text NOT NULL,
	`scenario` text NOT NULL,
	`setup_revision` integer NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`client_id`, `recipe`, `scenario`),
	FOREIGN KEY (`client_id`) REFERENCES `client_setups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_setups` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`offers` text NOT NULL,
	`profile` text NOT NULL,
	`create_hash` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `client_setups_updated_idx` ON `client_setups` (`updated_at`,`id`);