CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration` integer DEFAULT 120 NOT NULL,
	`mode` text DEFAULT 'Online' NOT NULL,
	`venue` text DEFAULT 'Online' NOT NULL,
	`speaker` text DEFAULT 'Edutantr team' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`capacity` integer DEFAULT 100 NOT NULL,
	`payment_url` text DEFAULT '' NOT NULL,
	`join_url` text DEFAULT '' NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`reminder` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail` (
	`id` text PRIMARY KEY NOT NULL,
	`registration_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mail_registration_kind` ON `mail` (`registration_id`,`kind`);--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`payment_ref` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_registration_event_user` ON `registrations` (`event_id`,`user_id`);