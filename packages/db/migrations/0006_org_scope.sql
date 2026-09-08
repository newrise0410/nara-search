CREATE TABLE "memberships" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id"),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" in ('owner','member'))
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_channels" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_competitors" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_keywords" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_presets" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_recent_searches" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_channels_org_id_idx" ON "alert_channels" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "alert_rules_org_id_idx" ON "alert_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_competitors_org_id_idx" ON "user_competitors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_keywords_org_id_idx" ON "user_keywords" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_presets_org_id_idx" ON "user_presets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_profiles_org_id_idx" ON "user_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_recent_searches_org_id_idx" ON "user_recent_searches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_settings_org_id_idx" ON "user_settings" USING btree ("org_id");