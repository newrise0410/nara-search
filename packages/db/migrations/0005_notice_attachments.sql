ALTER TABLE "notices" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "detail_url" text;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "lower_limit_rate" double precision;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "product_class" text;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "notice_kind" text;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "prespec_no" text;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "re_notice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "source" text;