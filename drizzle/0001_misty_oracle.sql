CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_event` ON `assets` (`event_id`);