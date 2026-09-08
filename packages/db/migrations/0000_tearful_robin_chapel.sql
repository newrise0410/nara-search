CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "agencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"bid_ntce_no" text NOT NULL,
	"ord" text NOT NULL,
	"opening_date" date NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"biz_div" text,
	"biz_div_key" text DEFAULT '' NOT NULL,
	"ntce_instt_cd" text,
	"ntce_instt_nm" text,
	"dmnd_instt_cd" text,
	"dmnd_instt_nm" text,
	"contract_method" text,
	"award_method" text,
	"contract_form" text,
	"lower_limit_rate" double precision,
	"estimated_price" bigint,
	"reserved_price" bigint,
	"base_amount" bigint,
	"opening_time" text,
	"final_amount" bigint,
	"final_rate" double precision,
	"final_date" date,
	"winner_biz_no" text,
	"winner_name" text,
	"winner_ceo" text,
	"winner_address" text,
	"winner_tel" text,
	"bidder_count" integer DEFAULT 0 NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "awards_bid_ntce_no_ord_opening_date_pk" PRIMARY KEY("bid_ntce_no","ord","opening_date")
)
PARTITION BY RANGE ("opening_date");
--> statement-breakpoint
CREATE TABLE "bidders" (
	"bid_ntce_no" text NOT NULL,
	"award_ord" text NOT NULL,
	"opening_date" date NOT NULL,
	"biz_no" text DEFAULT '' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"amount" bigint,
	"rate" double precision,
	"bid_date" date,
	"won" boolean DEFAULT false NOT NULL,
	"disqualified_reason" text,
	"result" text,
	CONSTRAINT "bidders_bid_ntce_no_award_ord_opening_date_biz_no_rank_pk" PRIMARY KEY("bid_ntce_no","award_ord","opening_date","biz_no","rank")
)
PARTITION BY RANGE ("opening_date");
--> statement-breakpoint
CREATE TABLE "companies" (
	"biz_no" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"ceo" text,
	"address" text,
	"tel" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"cntrct_no" text NOT NULL,
	"ord" text DEFAULT '00' NOT NULL,
	"unified_no" text,
	"title" text DEFAULT '' NOT NULL,
	"biz_div" text,
	"contract_form" text,
	"contract_method" text,
	"long_term" text,
	"joint" boolean DEFAULT false NOT NULL,
	"conclude_date" date,
	"period" text,
	"amount" bigint,
	"total_amount" bigint,
	"info_url" text,
	"bid_ntce_no" text,
	"bid_ntce_ord" text,
	"bid_ntce_nm" text,
	"notice_url" text,
	"opening_date" date,
	"reserved_price" bigint,
	"private_reason" text,
	"cntrct_instt_cd" text,
	"cntrct_instt_nm" text,
	"cntrct_instt_div" text,
	"dmnd_instt_cd" text,
	"dmnd_instt_nm" text,
	"dmnd_instt_div" text,
	"company_biz_no" text,
	"company_name" text,
	"company_ceo" text,
	"company_address" text,
	"company_tel" text,
	"domestic" boolean DEFAULT false NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_cntrct_no_ord_pk" PRIMARY KEY("cntrct_no","ord")
);
--> statement-breakpoint
CREATE TABLE "ingest_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingest_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"biz_div" text DEFAULT '' NOT NULL,
	"chunk_start" date NOT NULL,
	"chunk_end" date NOT NULL,
	"next_page" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"total_count" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"bid_ntce_no" text NOT NULL,
	"ord" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text,
	"biz_div" text,
	"notice_date" date,
	"ntce_instt_cd" text,
	"ntce_instt_nm" text,
	"dmnd_instt_cd" text,
	"dmnd_instt_nm" text,
	"contract_method" text,
	"award_method" text,
	"contract_form" text,
	"international" boolean DEFAULT false NOT NULL,
	"joint" boolean DEFAULT false NOT NULL,
	"electronic" boolean DEFAULT false NOT NULL,
	"officer" text,
	"officer_tel" text,
	"officer_dept" text,
	"briefing" boolean DEFAULT false NOT NULL,
	"briefing_date" date,
	"briefing_time" text,
	"briefing_place" text,
	"qualification_deadline" text,
	"bid_begin" text,
	"bid_close" text,
	"opening" text,
	"opening_place" text,
	"budget_amt" bigint,
	"estimated_price" bigint,
	"price_method" text,
	"region_limit" boolean DEFAULT false NOT NULL,
	"regions" text,
	"industry_limit" boolean DEFAULT false NOT NULL,
	"industries" text,
	"notice_url" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notices_bid_ntce_no_ord_pk" PRIMARY KEY("bid_ntce_no","ord")
);
--> statement-breakpoint
CREATE TABLE "prespec_docs" (
	"bf_spec_rgst_no" text NOT NULL,
	"seq" integer NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "prespec_docs_bf_spec_rgst_no_seq_pk" PRIMARY KEY("bf_spec_rgst_no","seq")
);
--> statement-breakpoint
CREATE TABLE "prespec_products" (
	"bf_spec_rgst_no" text NOT NULL,
	"seq" integer NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	CONSTRAINT "prespec_products_bf_spec_rgst_no_seq_pk" PRIMARY KEY("bf_spec_rgst_no","seq")
);
--> statement-breakpoint
CREATE TABLE "prespecs" (
	"bf_spec_rgst_no" text PRIMARY KEY NOT NULL,
	"biz_div" text,
	"biz_div_key" text DEFAULT '' NOT NULL,
	"ref_no" text,
	"title" text DEFAULT '' NOT NULL,
	"order_instt_nm" text,
	"dminstt_nm" text,
	"budget_amt" bigint,
	"receipt_date" date,
	"receipt_at" text,
	"opinion_close_at" text,
	"delivery_deadline_at" text,
	"delivery_days" integer,
	"officer" text,
	"officer_tel" text,
	"sw_biz" boolean DEFAULT false NOT NULL,
	"registered_at" text,
	"changed_at" text,
	"related_notice_nos" text[] DEFAULT '{}'::text[] NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agencies_name_trgm_idx" ON "agencies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "awards_title_trgm_idx" ON "awards" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "awards_opening_date_idx" ON "awards" USING btree ("opening_date");--> statement-breakpoint
CREATE INDEX "awards_winner_biz_no_idx" ON "awards" USING btree ("winner_biz_no");--> statement-breakpoint
CREATE INDEX "bidders_biz_no_idx" ON "bidders" USING btree ("biz_no");--> statement-breakpoint
CREATE INDEX "companies_name_trgm_idx" ON "companies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "contracts_title_trgm_idx" ON "contracts" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "contracts_conclude_date_idx" ON "contracts" USING btree ("conclude_date");--> statement-breakpoint
CREATE INDEX "contracts_bid_ntce_no_idx" ON "contracts" USING btree ("bid_ntce_no");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_jobs_key_uq" ON "ingest_jobs" USING btree ("kind","biz_div","chunk_start");--> statement-breakpoint
CREATE INDEX "ingest_jobs_pick_idx" ON "ingest_jobs" USING btree ("status","chunk_start");--> statement-breakpoint
CREATE INDEX "notices_title_trgm_idx" ON "notices" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notices_notice_date_idx" ON "notices" USING btree ("notice_date");--> statement-breakpoint
CREATE INDEX "notices_ntce_instt_cd_idx" ON "notices" USING btree ("ntce_instt_cd");--> statement-breakpoint
CREATE INDEX "prespecs_title_trgm_idx" ON "prespecs" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "prespecs_receipt_date_idx" ON "prespecs" USING btree ("receipt_date");
