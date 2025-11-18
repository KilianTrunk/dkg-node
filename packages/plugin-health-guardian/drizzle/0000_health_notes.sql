CREATE TABLE `community_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`ual` text,
	`summary` text NOT NULL,
	`confidence` real NOT NULL,
	`verdict` text NOT NULL,
	`sources` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_notes_note_id_unique` ON `community_notes` (`note_id`);--> statement-breakpoint
CREATE TABLE `health_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`claim_id` text NOT NULL,
	`claim` text NOT NULL,
	`status` text DEFAULT 'analyzing',
	`agent_id` text,
	`verdict` text,
	`confidence` real,
	`analysis` text,
	`analyzed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_claims_claim_id_unique` ON `health_claims` (`claim_id`);--> statement-breakpoint
CREATE TABLE `premium_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`payment_amount` real NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE TABLE `stakes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount` real NOT NULL,
	`position` text NOT NULL,
	`reasoning` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`note_id` text NOT NULL,
	`amount` real NOT NULL,
	`accuracy` real NOT NULL,
	`verdict` text NOT NULL,
	`final_verdict` text NOT NULL,
	`transaction_hash` text,
	`distributed_at` integer NOT NULL,
	`reason` text
);
