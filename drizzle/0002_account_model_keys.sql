CREATE TABLE `account_model_keys` (
	`scope` text NOT NULL,
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`tag` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `owner`, `provider`)
);
