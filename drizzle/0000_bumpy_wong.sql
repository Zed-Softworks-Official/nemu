CREATE TABLE `nemu_artist` (
	`id` varchar(128) NOT NULL,
	`user_id` text NOT NULL,
	`stripe_account` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`handle` varchar(255) NOT NULL,
	`about` text NOT NULL DEFAULT ('Peko Peko'),
	`location` varchar(256) NOT NULL,
	`terms` text NOT NULL DEFAULT ('Pls Feed Nemu'),
	`tip_jar_url` text,
	`header_photo` text NOT NULL DEFAULT ('/curved0.jpg'),
	`ut_key` text,
	`supporter` boolean NOT NULL DEFAULT false,
	`zed_customer_id` text,
	`automated_message_enabled` boolean DEFAULT false,
	`automated_message` text,
	`socials` json NOT NULL,
	CONSTRAINT `nemu_artist_id` PRIMARY KEY(`id`),
	CONSTRAINT `nemu_artist_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint
CREATE TABLE `nemu_download` (
	`id` varchar(128) NOT NULL,
	`user_id` text NOT NULL,
	`url` text NOT NULL,
	`ut_key` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`artist_id` text NOT NULL,
	`request_id` text,
	CONSTRAINT `nemu_download_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_favorite` (
	`id` varchar(128) NOT NULL,
	`user_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`commission_id` text,
	`product_id` text,
	CONSTRAINT `nemu_favorite_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_review` (
	`id` varchar(128) NOT NULL,
	`user_id` text NOT NULL,
	`rating` decimal(2,1) NOT NULL,
	`content` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`delivered` boolean DEFAULT false,
	`commission_id` text,
	`product_id` text,
	`request_id` varchar(128),
	CONSTRAINT `nemu_review_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_stripe_customer_ids` (
	`id` varchar(128) NOT NULL,
	`user_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`stripe_account` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nemu_stripe_customer_ids_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_user` (
	`clerk_id` varchar(256) NOT NULL,
	`role` enum('standard','artist','admin') DEFAULT 'standard',
	CONSTRAINT `nemu_user_clerk_id` PRIMARY KEY(`clerk_id`)
);
