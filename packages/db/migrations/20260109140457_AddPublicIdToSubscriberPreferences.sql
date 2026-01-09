ALTER TABLE "subscriber_preferences" ADD COLUMN "publicId" text NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_preferences_publicId_idx" ON "subscriber_preferences" USING btree ("publicId");--> statement-breakpoint
ALTER TABLE "subscriber_preferences" ADD CONSTRAINT "subscriber_preferences_publicId_unique" UNIQUE("publicId");