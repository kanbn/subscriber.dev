CREATE TABLE "deviceCode" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deviceCode" text NOT NULL,
	"userCode" text NOT NULL,
	"userId" bigint,
	"expiresAt" timestamp NOT NULL,
	"status" text NOT NULL,
	"lastPolledAt" timestamp,
	"pollingInterval" integer,
	"clientId" text,
	"scope" text
);
--> statement-breakpoint
ALTER TABLE "deviceCode" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deviceCode" ADD CONSTRAINT "deviceCode_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;