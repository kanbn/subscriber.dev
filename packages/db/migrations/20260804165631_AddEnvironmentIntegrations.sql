CREATE TABLE IF NOT EXISTS "environment_integrations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"environmentId" bigserial NOT NULL,
	"type" varchar(50) NOT NULL,
	"config" jsonb NOT NULL,
	"encryptedSecret" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" bigint,
	"updatedBy" bigint,
	CONSTRAINT "environment_integrations_env_type" UNIQUE("environmentId","type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "environment_integrations" ADD CONSTRAINT "environment_integrations_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "environment_integrations" ADD CONSTRAINT "environment_integrations_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "environment_integrations" ADD CONSTRAINT "environment_integrations_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "environment_integrations_environmentId_idx" ON "environment_integrations" USING btree ("environmentId");