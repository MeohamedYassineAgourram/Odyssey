CREATE TABLE `troy_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`best` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`runs` integer DEFAULT 0 NOT NULL,
	`clears` integer DEFAULT 0 NOT NULL,
	`stage` integer DEFAULT 1 NOT NULL,
	`endings` text DEFAULT '[]' NOT NULL,
	`last_ending` text,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `troy_run_receipts` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stage` integer NOT NULL,
	`xp` integer NOT NULL,
	`xp_before` integer NOT NULL,
	`breakdown` text NOT NULL,
	`score` integer NOT NULL,
	`ending` text NOT NULL,
	`outcome` text NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_troy_run_receipts_user_id` ON `troy_run_receipts` (`user_id`);