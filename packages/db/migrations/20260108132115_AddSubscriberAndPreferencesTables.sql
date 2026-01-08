CREATE TABLE IF NOT EXISTS "subscriber_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscriberId" bigserial NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"version" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscribers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"environmentId" bigserial NOT NULL,
	"email" varchar(255),
	"phone" varchar(255),
	"externalId" varchar(255),
	"firstName" varchar(255),
	"lastName" varchar(255),
	"name" varchar(255),
	"attributes" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"createdBy" bigint,
	"updatedBy" bigint,
	"deletedBy" bigint,
	CONSTRAINT "subscribers_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "subscribers_environment_externalId" UNIQUE("environmentId","externalId"),
	CONSTRAINT "subscribers_environment_email" UNIQUE("environmentId","email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriber_preferences" ADD CONSTRAINT "subscriber_preferences_subscriberId_subscribers_id_fk" FOREIGN KEY ("subscriberId") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_deletedBy_users_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_preferences_subscriberId_version_idx" ON "subscriber_preferences" USING btree ("subscriberId","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_preferences_subscriberId_idx" ON "subscriber_preferences" USING btree ("subscriberId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_environmentId_idx" ON "subscribers" USING btree ("environmentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_email_idx" ON "subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_externalId_idx" ON "subscribers" USING btree ("externalId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_publicId_idx" ON "subscribers" USING btree ("publicId");