CREATE TABLE `page_view_daily` (
	`day` text NOT NULL,
	`path` text NOT NULL,
	`ref_host` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`entry_id` text,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `path`, `ref_host`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_view_daily_day_idx` ON `page_view_daily` (`day`);--> statement-breakpoint
CREATE INDEX `page_view_daily_entry_idx` ON `page_view_daily` (`entry_id`,`day`);--> statement-breakpoint
CREATE TABLE `visit_daily` (
	`day` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`first_path` text,
	PRIMARY KEY(`day`, `visitor_hash`)
);
--> statement-breakpoint
CREATE INDEX `visit_daily_day_idx` ON `visit_daily` (`day`);