import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { PAID_PLANS, PLANS } from "@subscriber.dev/shared";

const planKeys = PLANS.map((plan) => plan.key) as [string, ...string[]];
const paidPlanKeys = PAID_PLANS.map((plan) => plan.key) as [
  string,
  ...string[],
];

export const BillingResponseSchema = z.object({
  enabled: z
    .boolean()
    .describe("False when billing is off, e.g. on a self-hosted install."),
  plan: z.enum(planKeys).describe('The current plan, e.g. "growth".'),
  interval: z.enum(["month", "year"]).nullable(),
  status: z
    .string()
    .describe('Stripe subscription status, e.g. "active" or "past_due".')
    .nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  usage: z.object({
    subscribers: z
      .number()
      .describe(
        "Subscribers billed on: opted-in subscribers in production, or distinct subscribers emailed this period if that's more.",
      ),
    subscriberLimit: z.number(),
    sendsThisMonth: z
      .number()
      .describe("Email and webhook steps sent this calendar month (UTC)."),
    sendLimit: z
      .number()
      .describe("Monthly send limit; null when the plan doesn't limit sends.")
      .nullable(),
  }),
  overLimit: z.boolean(),
  ceiling: z
    .number()
    .describe(
      "Sends to subscribers past this aren't sent until an upgrade: the free plan's limit, or one plan up for paid plans.",
    ),
  movesUpOn: z.iso
    .datetime()
    .describe(
      "When an over-limit paid workspace moves up one plan (3 days after going over); null when not over.",
    )
    .nullable(),
  planAtRenewal: z
    .string()
    .describe(
      'The plan this workspace moves to at its next renewal, from its subscriber count; "custom" above the largest plan; null when it stays the same.',
    )
    .nullable(),
});

export const CreateCheckoutSchema = z.object({
  plan: z.enum(paidPlanKeys).describe('A paid plan, e.g. "growth".'),
  interval: z.enum(["month", "year"]).default("month"),
});

export const BillingLinkResponseSchema = z.object({
  url: z.string().describe("A Stripe page to open in the browser."),
  kind: z
    .enum(["checkout", "portal", "changed"])
    .describe(
      "checkout: open the URL to start a plan. changed: the existing plan was changed straight away, prorated. portal: open the URL to manage card, invoices or cancel.",
    ),
});

export class BillingResponseDto extends createZodDto(BillingResponseSchema) {}
export class CreateCheckoutDto extends createZodDto(CreateCheckoutSchema) {}
export class BillingLinkResponseDto extends createZodDto(
  BillingLinkResponseSchema,
) {}
