import type { SQL } from "drizzle-orm";
import { and, eq, inArray, isNull, not, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { dbClient } from "@subscriber.dev/db/client";
import { latestOptedInOrOutSubscriberIds } from "@subscriber.dev/db/repository/subscriber.repo";
import { subscribers, subscriberTags } from "@subscriber.dev/db/schema";

const OptedInConditionSchema = z.object({
  type: z.literal("optedIn"),
});

const TagConditionSchema = z.object({
  type: z.literal("tag"),
  tag: z.string().min(1),
});

const AttributeConditionSchema = z.object({
  type: z.literal("attribute"),
  field: z.string().min(1),
  op: z.enum(["equals", "contains", "exists"]),
  value: z.string().optional(),
});

export interface AudienceAndCondition {
  type: "and";
  clauses: AudienceCondition[];
}

export interface AudienceOrCondition {
  type: "or";
  clauses: AudienceCondition[];
}

export interface AudienceNotCondition {
  type: "not";
  clause: AudienceCondition;
}

export type AudienceCondition =
  | z.infer<typeof OptedInConditionSchema>
  | z.infer<typeof TagConditionSchema>
  | z.infer<typeof AttributeConditionSchema>
  | AudienceAndCondition
  | AudienceOrCondition
  | AudienceNotCondition;

export const AudienceConditionSchema: z.ZodType<AudienceCondition> = z.lazy(
  () =>
    z.union([
      OptedInConditionSchema,
      TagConditionSchema,
      AttributeConditionSchema,
      z.object({
        type: z.literal("and"),
        clauses: z.array(AudienceConditionSchema).min(1),
      }),
      z.object({
        type: z.literal("or"),
        clauses: z.array(AudienceConditionSchema).min(1),
      }),
      z.object({
        type: z.literal("not"),
        clause: AudienceConditionSchema,
      }),
    ]),
);

function buildAttributeCondition(
  condition: z.infer<typeof AttributeConditionSchema>,
): SQL {
  if (condition.op === "exists") {
    return sql`(${subscribers.attributes} ? ${condition.field})`;
  }

  if (condition.value === undefined) {
    throw new Error(
      `Audience attribute condition on "${condition.field}" with op "${condition.op}" requires a value`,
    );
  }

  const fieldExpr = sql`(${subscribers.attributes} ->> ${condition.field})`;
  if (condition.op === "equals") {
    return sql`(${fieldExpr} = ${condition.value})`;
  }

  return sql`(${fieldExpr} ILIKE ${`%${condition.value}%`})`;
}

export function buildAudienceCondition(
  db: dbClient,
  environmentId: number,
  condition: AudienceCondition,
): SQL {
  switch (condition.type) {
    case "optedIn":
      return inArray(
        subscribers.id,
        latestOptedInOrOutSubscriberIds(db, environmentId, true),
      );

    case "tag":
      return inArray(
        subscribers.id,
        db
          .select({ subscriberId: subscriberTags.subscriberId })
          .from(subscriberTags)
          .where(
            and(
              sql`${subscriberTags.environmentId} = ${environmentId}`,
              sql`${subscriberTags.tag} = ${condition.tag}`,
            ),
          ),
      );

    case "attribute":
      return buildAttributeCondition(condition);

    case "and": {
      const combined = and(
        ...condition.clauses.map((clause) =>
          buildAudienceCondition(db, environmentId, clause),
        ),
      );
      if (!combined) throw new Error("Empty 'and' clause");
      return combined;
    }

    case "or": {
      const combined = or(
        ...condition.clauses.map((clause) =>
          buildAudienceCondition(db, environmentId, clause),
        ),
      );
      if (!combined) throw new Error("Empty 'or' clause");
      return combined;
    }

    case "not":
      return not(buildAudienceCondition(db, environmentId, condition.clause));
  }
}

export async function resolveAudienceSubscriberIds(
  db: dbClient,
  environmentId: number,
  query: AudienceCondition,
): Promise<number[]> {
  const rows = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.environmentId, environmentId),
        isNull(subscribers.deletedAt),
        buildAudienceCondition(db, environmentId, query),
      ),
    );

  return rows.map((row) => row.id);
}
