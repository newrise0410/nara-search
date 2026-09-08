CREATE TABLE "alert_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_channels_type_check" CHECK ("alert_channels"."type" in ('kakao','email','webhook','webpush'))
);
--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"kinds" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"profile_id" uuid,
	"category_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"agency" text,
	"amount_min" bigint,
	"amount_max" bigint,
	"channel_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"digest" text DEFAULT 'instant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_rules_digest_check" CHECK ("alert_rules"."digest" in ('instant','daily'))
);
--> statement-breakpoint
CREATE TABLE "alert_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"matched" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_profile_id_user_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_channels_user_id_idx" ON "alert_channels" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_uq" ON "alert_deliveries" USING btree ("rule_id","item_id","channel_id");--> statement-breakpoint
CREATE INDEX "alert_deliveries_sent_at_idx" ON "alert_deliveries" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "alert_rules_user_id_idx" ON "alert_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_rules_enabled_idx" ON "alert_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "alert_runs_finished_at_idx" ON "alert_runs" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "awards_updated_at_idx" ON "awards" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "contracts_updated_at_idx" ON "contracts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "notices_updated_at_idx" ON "notices" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "prespecs_updated_at_idx" ON "prespecs" USING btree ("updated_at");