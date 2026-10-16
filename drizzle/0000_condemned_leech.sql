CREATE TABLE `click_logs` (
	`entry_id` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`entry_id`, `day`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`link_mode` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`summary` text NOT NULL,
	`url` text,
	`icon` text,
	`cover` text,
	`note` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_weight` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`click_count` integer DEFAULT 0 NOT NULL,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_type_slug_uniq` ON `entries` (`type`,`slug`);--> statement-breakpoint
CREATE INDEX `entries_type_status_idx` ON `entries` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `entries_link_mode_idx` ON `entries` (`link_mode`);--> statement-breakpoint
CREATE INDEX `entries_featured_idx` ON `entries` (`featured`);--> statement-breakpoint
CREATE INDEX `entries_created_idx` ON `entries` (`created_at`);--> statement-breakpoint
CREATE TABLE `entry_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`name` text,
	`address` text NOT NULL,
	`province` text,
	`city` text NOT NULL,
	`district` text,
	`lat` real,
	`lng` real,
	`poi_source` text,
	`poi_id` text,
	`phone` text,
	`hours` text,
	`price_level` integer,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `branches_entry_idx` ON `entry_branches` (`entry_id`);--> statement-breakpoint
CREATE INDEX `branches_city_idx` ON `entry_branches` (`city`);--> statement-breakpoint
CREATE INDEX `branches_geo_idx` ON `entry_branches` (`lat`,`lng`);--> statement-breakpoint
CREATE TABLE `entry_qrcodes` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`image` text NOT NULL,
	`tip` text,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`show_count` integer DEFAULT 0 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qrcodes_entry_idx` ON `entry_qrcodes` (`entry_id`,`sort`);--> statement-breakpoint
CREATE INDEX `qrcodes_expires_idx` ON `entry_qrcodes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`entry_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`entry_id`, `tag_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_tags_tag_idx` ON `entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `entry_tools` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`component` text NOT NULL,
	`runtime` text DEFAULT 'client' NOT NULL,
	`requires_login` integer DEFAULT false NOT NULL,
	`version` text,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`changelog` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `link_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`status_code` integer,
	`ok` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `link_checks_entry_idx` ON `link_checks` (`entry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
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
CREATE INDEX `submissions_status_created_idx` ON `submissions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`dim` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text,
	`desc` text,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_dim_slug_uniq` ON `tags` (`dim`,`slug`);--> statement-breakpoint
CREATE INDEX `tags_dim_sort_idx` ON `tags` (`dim`,`sort`);