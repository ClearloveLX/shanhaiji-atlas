PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'entry' NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`type` text,
	`reason` text,
	`contact` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_id` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`ip_hash` text,
	FOREIGN KEY (`result_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_submissions`("id", "kind", "name", "url", "type", "reason", "contact", "status", "result_id", "created_at", "reviewed_at", "ip_hash") SELECT "id", "kind", "name", "url", "type", "reason", "contact", "status", "result_id", "created_at", "reviewed_at", "ip_hash" FROM `submissions`;--> statement-breakpoint
DROP TABLE `submissions`;--> statement-breakpoint
ALTER TABLE `__new_submissions` RENAME TO `submissions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `submissions_status_created_idx` ON `submissions` (`status`,`created_at`);