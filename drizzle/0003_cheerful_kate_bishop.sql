CREATE TABLE `mail_dispatches` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'preparing' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `mail` ADD `include_join_link` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mail` ADD `requires_confirmation` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mail` ADD `dispatch_id` text REFERENCES mail_dispatches(id);--> statement-breakpoint
ALTER TABLE `mail` ADD `provider_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `mail` ADD `sent_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_mail_dispatch` ON `mail` (`dispatch_id`);--> statement-breakpoint
CREATE INDEX `idx_mail_status_due` ON `mail` (`status`,`due_at`);