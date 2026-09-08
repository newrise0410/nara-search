ALTER TABLE "awards" ALTER COLUMN "estimated_price" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "awards" ALTER COLUMN "reserved_price" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "awards" ALTER COLUMN "base_amount" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "awards" ALTER COLUMN "final_amount" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "bidders" ALTER COLUMN "amount" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "amount" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "total_amount" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "reserved_price" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "notices" ALTER COLUMN "budget_amt" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "notices" ALTER COLUMN "estimated_price" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "prespecs" ALTER COLUMN "budget_amt" SET DATA TYPE numeric(18, 2);