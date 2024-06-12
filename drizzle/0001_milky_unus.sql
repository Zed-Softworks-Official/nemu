CREATE TABLE `nemu_artist_code` (
	`id` varchar(128) NOT NULL,
	`code` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nemu_artist_code_id` PRIMARY KEY(`id`),
	CONSTRAINT `nemu_artist_code_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `nemu_artist_verification` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(256) NOT NULL,
	`requested_handle` varchar(128) NOT NULL,
	`location` varchar(256) NOT NULL,
	`twitter` text,
	`pixiv` text,
	`website` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nemu_artist_verification_id` PRIMARY KEY(`id`),
	CONSTRAINT `nemu_artist_verification_requested_handle_unique` UNIQUE(`requested_handle`)
);
--> statement-breakpoint
CREATE TABLE `nemu_commission` (
	`id` varchar(128) NOT NULL,
	`artist_id` text NOT NULL,
	`price` int NOT NULL,
	`rating` decimal(2,1) NOT NULL,
	`form_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`images` json NOT NULL,
	`availability` enum('closed','waitlist','open') NOT NULL,
	`slug` text NOT NULL,
	`published` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`max_commissions_until_waitlist` int NOT NULL DEFAULT 0,
	`max_commissions_until_closed` int NOT NULL DEFAULT 0,
	`total_requests` int NOT NULL DEFAULT 0,
	`new_requests` int NOT NULL DEFAULT 0,
	`accepted_requests` int NOT NULL DEFAULT 0,
	`rejected_requests` int NOT NULL DEFAULT 0,
	`rush_orders_allowed` boolean DEFAULT false,
	`rush_charge` decimal(3,2) DEFAULT '0.00',
	`rush_percentage` boolean DEFAULT false,
	CONSTRAINT `nemu_commission_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_form` (
	`id` varchar(128) NOT NULL,
	`artist_id` text NOT NULL,
	`commission_id` json,
	`name` text NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`content` json DEFAULT ('[]'),
	CONSTRAINT `nemu_form_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_invoice_item` (
	`id` varchar(128) NOT NULL,
	`invoice_id` text NOT NULL,
	`name` text NOT NULL,
	`price` int NOT NULL,
	`quantity` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nemu_invoice_item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_invoice` (
	`id` varchar(128) NOT NULL,
	`sent` boolean NOT NULL DEFAULT false,
	`hosted_url` text,
	`status` enum('creating','pending','paid','cancelled') NOT NULL,
	`stripe_id` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`customer_id` text NOT NULL,
	`stripe_account` text NOT NULL,
	`total` int NOT NULL,
	`user_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`request_id` text NOT NULL,
	CONSTRAINT `nemu_invoice_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_kanban` (
	`id` varchar(128) NOT NULL,
	`request_id` text NOT NULL,
	`containers` json,
	`tasks` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nemu_kanban_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_portfolio` (
	`id` varchar(128) NOT NULL,
	`artist_id` text NOT NULL,
	`image_url` text NOT NULL,
	`ut_key` text NOT NULL,
	`title` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`request_id` text,
	CONSTRAINT `nemu_portfolio_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_product` (
	`id` varchar(128) NOT NULL,
	`artist_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`price` decimal(2,2) NOT NULL,
	`images` json,
	`ut_keys` json,
	`downloadable_asset` varchar(256),
	`slug` text,
	`published` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nemu_product_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nemu_request` (
	`id` varchar(128) NOT NULL,
	`form_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`status` enum('pending','accepted','rejected','delivered','waitlist') NOT NULL,
	`commission_id` text NOT NULL,
	`order_id` text NOT NULL,
	`invoice_id` text,
	`kanban_id` text,
	`download_id` text,
	`sendbird_channel_url` text,
	`content` json NOT NULL,
	CONSTRAINT `nemu_request_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `user_idx` ON `nemu_artist_verification` (`user_id`);