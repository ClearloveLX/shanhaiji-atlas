CREATE TABLE `entry_private` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`rating` integer,
	`status` text,
	`note` text,
	`contact` text,
	`paid` text,
	`visited_on` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `entries` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
CREATE INDEX `entries_visibility_idx` ON `entries` (`visibility`,`type`,`status`);