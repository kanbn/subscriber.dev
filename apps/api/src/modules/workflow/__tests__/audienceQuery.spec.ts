import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as schema from "@subscriber.dev/db/schema";

import {
  AudienceConditionSchema,
  buildAudienceCondition,
} from "../audienceQuery.js";

const db = drizzle(
  new Pool({ connectionString: "postgres://fake:fake@localhost:1/fake" }),
  { schema },
) as unknown as dbClient;

const dialect = new PgDialect();

function render(condition: Parameters<typeof buildAudienceCondition>[2]) {
  return dialect.sqlToQuery(buildAudienceCondition(db, 10, condition));
}

describe("buildAudienceCondition", () => {
  it("renders 'optedIn' as an IN against the latest-preference subquery", () => {
    const { sql, params } = render({ type: "optedIn" });

    expect(sql).toContain('"subscribers"."id" in');
    expect(sql).toContain("subscriber_preferences");
    expect(params).toContain(10); // environmentId
    expect(params).toContain(true); // opted in
  });

  it("renders 'tag' as an IN against subscriber_tags scoped to the environment", () => {
    const { sql, params } = render({ type: "tag", tag: "vip" });

    expect(sql).toBe(
      '"subscribers"."id" in (select "subscriberId" from "subscriber_tags" where ("subscriber_tags"."environmentId" = $1 and "subscriber_tags"."tag" = $2))',
    );
    expect(params).toEqual([10, "vip"]);
  });

  it("renders 'attribute equals' as a jsonb ->> text comparison", () => {
    const { sql, params } = render({
      type: "attribute",
      field: "plan",
      op: "equals",
      value: "pro",
    });

    expect(sql).toBe('(("subscribers"."attributes" ->> $1) = $2)');
    expect(params).toEqual(["plan", "pro"]);
  });

  it("renders 'attribute contains' as an ILIKE substring match", () => {
    const { sql, params } = render({
      type: "attribute",
      field: "plan",
      op: "contains",
      value: "pro",
    });

    expect(sql).toBe('(("subscribers"."attributes" ->> $1) ILIKE $2)');
    expect(params).toEqual(["plan", "%pro%"]);
  });

  it("renders 'attribute exists' as a jsonb key-existence check", () => {
    const { sql, params } = render({
      type: "attribute",
      field: "plan",
      op: "exists",
    });

    expect(sql).toBe('("subscribers"."attributes" ? $1)');
    expect(params).toEqual(["plan"]);
  });

  it("throws when 'equals' is used without a value", () => {
    expect(() =>
      render({ type: "attribute", field: "plan", op: "equals" }),
    ).toThrow(/requires a value/);
  });

  it("throws when 'contains' is used without a value", () => {
    expect(() =>
      render({ type: "attribute", field: "plan", op: "contains" }),
    ).toThrow(/requires a value/);
  });

  it("renders 'and' as a conjunction of its clauses", () => {
    const { sql, params } = render({
      type: "and",
      clauses: [{ type: "optedIn" }, { type: "tag", tag: "vip" }],
    });

    expect(sql).toContain(" and ");
    expect(sql).toContain("subscriber_tags");
    expect(params).toEqual([10, true, 10, "vip"]);
  });

  it("renders 'or' as a disjunction of its clauses", () => {
    const { sql } = render({
      type: "or",
      clauses: [
        { type: "tag", tag: "vip" },
        { type: "tag", tag: "beta" },
      ],
    });

    expect(sql).toContain(" or ");
  });

  it("renders 'not' as a negation of its clause", () => {
    const { sql } = render({
      type: "not",
      clause: { type: "optedIn" },
    });

    expect(sql.startsWith("not ")).toBe(true);
  });

  it("renders a nested and/or/not tree correctly", () => {
    const { sql, params } = render({
      type: "and",
      clauses: [
        { type: "optedIn" },
        {
          type: "or",
          clauses: [
            { type: "tag", tag: "vip" },
            { type: "not", clause: { type: "tag", tag: "churned" } },
          ],
        },
      ],
    });

    expect(sql).toContain(" and (");
    expect(sql).toContain(" or ");
    expect(sql).toContain("not ");
    expect(params).toEqual([10, true, 10, "vip", 10, "churned"]);
  });
});

describe("AudienceConditionSchema", () => {
  it("accepts a valid nested tree", () => {
    const result = AudienceConditionSchema.safeParse({
      type: "and",
      clauses: [
        { type: "optedIn" },
        { type: "or", clauses: [{ type: "tag", tag: "vip" }] },
        {
          type: "attribute",
          field: "plan",
          op: "equals",
          value: "pro",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown condition type", () => {
    const result = AudienceConditionSchema.safeParse({ type: "event" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty 'and' clauses array", () => {
    const result = AudienceConditionSchema.safeParse({
      type: "and",
      clauses: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a 'tag' condition missing the tag field", () => {
    const result = AudienceConditionSchema.safeParse({ type: "tag" });
    expect(result.success).toBe(false);
  });
});
