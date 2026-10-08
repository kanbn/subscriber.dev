DROP TABLE "invitations" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "stripeCustomerId";--> statement-breakpoint
DROP TYPE "public"."invitationStatus";