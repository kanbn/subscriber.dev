ALTER TABLE "environment_integrations" ADD COLUMN "priority" integer;--> statement-breakpoint
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "environmentId" ORDER BY "id") AS rn
  FROM "environment_integrations"
)
UPDATE "environment_integrations" e SET "priority" = ranked.rn
FROM ranked WHERE ranked."id" = e."id";