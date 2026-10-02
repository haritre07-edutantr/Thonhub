ALTER TABLE `assets` ADD `kind` text DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `mentor_bio` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `mentor_portfolio_url` text DEFAULT '' NOT NULL;