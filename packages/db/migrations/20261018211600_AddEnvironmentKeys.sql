CREATE TABLE "environment_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"environmentId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"keyHash" text NOT NULL,
	"start" varchar(32) NOT NULL,
	"scopes" text[] NOT NULL,
	"createdBy" bigint,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "environment_keys_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "environment_keys_keyHash_unique" UNIQUE("keyHash")
);
--> statement-breakpoint
ALTER TABLE "environment_keys" ADD CONSTRAINT "environment_keys_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_keys" ADD CONSTRAINT "environment_keys_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_keys_environmentId_idx" ON "environment_keys" USING btree ("environmentId");