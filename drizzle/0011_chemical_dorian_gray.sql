CREATE TABLE `retell_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`marker` text NOT NULL,
	`llm_id` text DEFAULT '' NOT NULL,
	`agent_id` text DEFAULT '' NOT NULL,
	`voice_id` text DEFAULT '' NOT NULL,
	`phase` text DEFAULT 'connected' NOT NULL,
	`mode` text DEFAULT 'test' NOT NULL,
	`inbound_number` text DEFAULT '' NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`last_verified_at` text DEFAULT '' NOT NULL,
	`last_captured_at` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
