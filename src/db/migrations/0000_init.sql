CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`account_number` text,
	`iban` text,
	`type` text DEFAULT 'checking' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`include_in_net_worth` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_account_number_unique` ON `accounts` (`account_number`);--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_snapshots_account_date_idx` ON `balance_snapshots` (`account_id`,`date`,`source`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`kat0` text DEFAULT '' NOT NULL,
	`kat1` text DEFAULT '' NOT NULL,
	`kat2` text DEFAULT '' NOT NULL,
	`fixed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_key_unique` ON `categories` (`name_key`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`account_id` integer,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`rows_new` integer DEFAULT 0 NOT NULL,
	`rows_duplicate` integer DEFAULT 0 NOT NULL,
	`rows_replaced` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`counterparty` text DEFAULT '' NOT NULL,
	`principal_cents` integer NOT NULL,
	`interest_rate` real DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`match_text` text NOT NULL,
	`is_liability` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payee_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raw_name` text NOT NULL,
	`raw_key` text NOT NULL,
	`payee` text NOT NULL,
	`default_comment` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payee_mappings_raw_key_unique` ON `payee_mappings` (`raw_key`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`field` text NOT NULL,
	`op` text DEFAULT 'contains' NOT NULL,
	`value` text NOT NULL,
	`field2` text,
	`op2` text,
	`value2` text,
	`amount_min_cents` integer,
	`amount_max_cents` integer,
	`set_payee` text,
	`set_category` text,
	`set_comment` text,
	`set_transfer` integer,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`category` text,
	`comment` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`import_id` integer,
	`booked_at` text NOT NULL,
	`booking_date` text NOT NULL,
	`value_date` text,
	`amount_cents` integer NOT NULL,
	`booking_type` text DEFAULT '' NOT NULL,
	`raw_name` text DEFAULT '' NOT NULL,
	`iban` text DEFAULT '' NOT NULL,
	`bic` text DEFAULT '' NOT NULL,
	`creditor_id` text DEFAULT '' NOT NULL,
	`mandate_ref` text DEFAULT '' NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`e2e_id` text DEFAULT '' NOT NULL,
	`terminal_id` text,
	`status` text DEFAULT 'booked' NOT NULL,
	`hash` text NOT NULL,
	`payee` text,
	`category` text,
	`comment` text DEFAULT '' NOT NULL,
	`needs_review` integer DEFAULT true NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`is_transfer` integer DEFAULT false NOT NULL,
	`resolved_by` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_hash_idx` ON `transactions` (`hash`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`booking_date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);