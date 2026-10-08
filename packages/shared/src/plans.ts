
export const PLANS = [
  { key: "free", subscribers: 1_000, monthly: 0 },
  { key: "starter", subscribers: 5_000, monthly: 19 },
  { key: "growth", subscribers: 10_000, monthly: 39 },
  { key: "scale", subscribers: 25_000, monthly: 79 },
  { key: "pro", subscribers: 50_000, monthly: 159 },
  { key: "business", subscribers: 100_000, monthly: 279 },
] as const;

export type Plan = (typeof PLANS)[number];
export type PlanKey = Plan["key"];
export type BillingInterval = "month" | "year";

export const PAID_PLANS = PLANS.filter((plan) => plan.monthly > 0);

export const FREE_SENDS_PER_MONTH = 10_000;

export const yearlyPrice = (plan: Plan) => plan.monthly * 10;

export const planByKey = (key: string) => PLANS.find((plan) => plan.key === key);

export const priceLookupKey = (key: PlanKey, interval: BillingInterval) =>
  `sub_${key}_${interval}`;

export function parseLookupKey(
  lookupKey: string | null | undefined,
): { plan: Plan; interval: BillingInterval } | null {
  const match = /^sub_([a-z]+)_(month|year)$/.exec(lookupKey ?? "");
  if (!match) return null;
  const plan = planByKey(match[1] ?? "");
  return plan ? { plan, interval: match[2] as BillingInterval } : null;
}

export const planForSubscribers = (count: number): Plan | null =>
  PLANS.find((plan) => count <= plan.subscribers) ?? null;
