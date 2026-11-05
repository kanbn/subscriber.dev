import { describe, expect, it } from "vitest";

import {
  parseLookupKey,
  planByKey,
  planForSubscribers,
  priceLookupKey,
  yearlyPrice,
} from "@subscriber.dev/shared";

import {
  ceilingFor,
  isStaleSubscription,
  MOVE_UP_AFTER_MS,
  moveUpTarget,
  renewalPlan,
} from "../billing.service.js";

const plan = (key: string) => {
  const found = planByKey(key);
  if (!found) throw new Error(key);
  return found;
};
const DAY = 24 * 60 * 60 * 1000;

describe("plans", () => {
  it("picks the cheapest plan that covers a subscriber count", () => {
    expect(planForSubscribers(0)?.key).toBe("free");
    expect(planForSubscribers(1_000)?.key).toBe("free");
    expect(planForSubscribers(1_001)?.key).toBe("starter");
    expect(planForSubscribers(100_000)?.key).toBe("business");
    expect(planForSubscribers(100_001)).toBeNull();
  });

  it("round-trips Stripe lookup keys", () => {
    expect(priceLookupKey("growth", "year")).toBe("sub_growth_year");
    expect(parseLookupKey("sub_growth_year")).toMatchObject({
      plan: { key: "growth" },
      interval: "year",
    });
    expect(parseLookupKey("sub_nope_month")).toBeNull();
    expect(parseLookupKey("growth_month")).toBeNull();
    expect(parseLookupKey(null)).toBeNull();
  });

  it("makes annual two months free", () => {
    expect(
      yearlyPrice({ key: "growth", subscribers: 10_000, monthly: 39 }),
    ).toBe(390);
  });
});

describe("renewalPlan", () => {
  it("moves paid workspaces up and down with their list", () => {
    expect(renewalPlan(12_000)?.key).toBe("scale");
    expect(renewalPlan(4_000)?.key).toBe("starter");
  });

  it("never drops a paid workspace to free", () => {
    expect(renewalPlan(10)?.key).toBe("starter");
  });

  it("leaves lists past the largest plan to a custom deal", () => {
    expect(renewalPlan(150_000)).toBeNull();
  });
});

describe("ceilingFor", () => {
  it("holds the free plan at its own limit", () => {
    expect(ceilingFor(plan("free"))).toBe(1_000);
  });

  it("lets paid plans grow one plan up before holding sends", () => {
    expect(ceilingFor(plan("starter"))).toBe(10_000);
    expect(ceilingFor(plan("pro"))).toBe(100_000);
  });

  it("stops at the largest plan", () => {
    expect(ceilingFor(plan("business"))).toBe(100_000);
  });
});

describe("moveUpTarget", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const since = (days: number) => new Date(now.getTime() - days * DAY);

  it("waits 3 days over the limit before moving", () => {
    expect(moveUpTarget(plan("starter"), 6_000, since(2), now)).toBeNull();
    expect(moveUpTarget(plan("starter"), 6_000, since(3), now)?.key).toBe(
      "growth",
    );
  });

  it("moves at most one plan, however far over", () => {
    expect(moveUpTarget(plan("starter"), 90_000, since(5), now)?.key).toBe(
      "growth",
    );
  });

  it("does nothing under the limit, on free, or past the largest plan", () => {
    expect(moveUpTarget(plan("starter"), 5_000, since(5), now)).toBeNull();
    expect(moveUpTarget(plan("free"), 5_000, since(5), now)).toBeNull();
    expect(moveUpTarget(plan("business"), 150_000, since(5), now)).toBeNull();
  });

  it("needs a recorded start to the 3 days", () => {
    expect(moveUpTarget(plan("starter"), 6_000, null, now)).toBeNull();
    expect(MOVE_UP_AFTER_MS).toBe(3 * DAY);
  });
});

describe("isStaleSubscription", () => {
  const current = { stripeSubscriptionId: "sub_new", status: "active" };

  it("ignores a late cancellation of an old subscription", () => {
    expect(
      isStaleSubscription(current, { id: "sub_old", status: "canceled" }),
    ).toBe(true);
  });

  it("ignores another subscription while the current one is active", () => {
    expect(
      isStaleSubscription(current, { id: "sub_other", status: "active" }),
    ).toBe(true);
  });

  it("applies events for the current subscription", () => {
    expect(
      isStaleSubscription(current, { id: "sub_new", status: "canceled" }),
    ).toBe(false);
  });

  it("lets a new subscription replace a lapsed or missing one", () => {
    expect(
      isStaleSubscription(
        { stripeSubscriptionId: "sub_old", status: "unpaid" },
        { id: "sub_new", status: "active" },
      ),
    ).toBe(false);
    expect(
      isStaleSubscription(
        { stripeSubscriptionId: null, status: "canceled" },
        { id: "sub_new", status: "active" },
      ),
    ).toBe(false);
  });
});
