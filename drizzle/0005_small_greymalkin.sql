ALTER TABLE `credit_policies` RENAME COLUMN `priceCentsPerCredit` TO `priceCentsPerTenCredits`;--> statement-breakpoint
ALTER TABLE `credit_policies` MODIFY COLUMN `priceCentsPerTenCredits` int NOT NULL DEFAULT 100;
--> statement-breakpoint
UPDATE `credit_policies`
SET `priceCentsPerTenCredits` = `priceCentsPerTenCredits` * 10;
