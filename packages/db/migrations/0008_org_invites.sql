CREATE TABLE "org_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_invites_role_check" CHECK ("org_invites"."role" in ('owner','member'))
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "active_org_id" uuid;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_invited_by_app_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_token_hash_uq" ON "org_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_org_id_email_uq" ON "org_invites" USING btree ("org_id","email");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_active_org_id_orgs_id_fk" FOREIGN KEY ("active_org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;