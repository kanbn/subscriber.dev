import type { Command } from "commander";

import type {
  BillingResponseDto,
  CreateCheckoutDtoPlan,
} from "@subscriber.dev/api-client/cli";
import {
  createBillingPortalLink,
  createCheckoutLink,
  getBilling,
} from "@subscriber.dev/api-client/cli";
import { PAID_PLANS, planByKey, readCliConfig } from "@subscriber.dev/shared";

import { ensureLoggedIn } from "../auth.js";
import { requireWorkspaceId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";
import { openBrowser } from "./login.js";

const n = (value: number) => value.toLocaleString("en-US");
export const price = (key: string) => `$${planByKey(key)?.monthly ?? 0}/mo`;

const isCloud = () =>
  (readCliConfig().apiBaseUrl ?? "https://api.subscriber.dev").includes(
    "api.subscriber.dev",
  );

export function billingLines(data: BillingResponseDto): [string, string][] {
  const usage = {
    subscribers: data.usage.subscribers ?? 0,
    subscriberLimit: data.usage.subscriberLimit ?? 0,
    sendsThisMonth: data.usage.sendsThisMonth ?? 0,
    sendLimit: data.usage.sendLimit ?? null,
  };
  const renews = data.currentPeriodEnd
    ? ` · ${data.cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(data.currentPeriodEnd).toDateString()}`
    : "";
  const lines: [string, string][] = [
    [
      "plan",
      `${data.plan} · ${price(data.plan)}${data.interval === "year" ? " (billed yearly)" : ""}${renews}`,
    ],
    ["subscribers", `${n(usage.subscribers)} / ${n(usage.subscriberLimit)}`],
    [
      "sends",
      `${n(usage.sendsThisMonth)} this month${usage.sendLimit ? ` / ${n(usage.sendLimit)}` : " (no limit)"}`,
    ],
  ];
  if (data.planAtRenewal === "custom")
    lines.push([
      "at renewal",
      "past the largest plan; email hello@subscriber.dev",
    ]);
  else if (data.planAtRenewal)
    lines.push([
      "at renewal",
      `moves to ${data.planAtRenewal} (${price(data.planAtRenewal)})`,
    ]);
  if (data.movesUpOn)
    lines.push([
      "over limit",
      `moves up a plan on ${new Date(data.movesUpOn).toDateString()}`,
    ]);
  if ((data.usage.subscribers ?? 0) > data.ceiling)
    lines.push([
      "held",
      `sends past ${n(data.ceiling)} subscribers wait for an upgrade`,
    ]);
  return lines;
}

function ok<T>(response: { status: number; data: T }): T | undefined {
  if (response.status < 400) return response.data;
  const message = (response.data as { message?: unknown } | undefined)?.message;
  console.error(
    typeof message === "string"
      ? message
      : `Request failed (${response.status}).`,
  );
  process.exitCode = 1;
  return undefined;
}

function openLink(link: { url: string; kind: string }) {
  if (link.kind === "changed") {
    console.log(
      "Plan changed. The difference is charged or credited pro rata. Run `subscriber billing` to see it.",
    );
    return;
  }
  console.log(
    link.kind === "portal"
      ? "Opening the billing portal, where you can change or cancel your plan:"
      : "Opening Stripe Checkout:",
  );
  console.log(link.url);
  openBrowser(link.url);
}

export function registerBillingCommand(program: Command): void {
  const billing = program
    .command("billing", { hidden: !isCloud() })
    .description("Show your plan and usage, or change plan")
    .option(
      "--workspace <workspaceId>",
      "workspace public ID (defaults to the current workspace)",
    )
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { workspace?: string; json?: boolean }) => {
        ensureLoggedIn();
        const data = ok(await getBilling(requireWorkspaceId(opts)));
        if (!data) return;
        if (opts.json) return printResult(data, opts);
        for (const [label, value] of billingLines(data))
          console.log(`${label.padEnd(13)}${value}`);

        if (data.plan === "free" && data.overLimit)
          console.log(
            "\nYou're over the free plan. Run `subscriber billing upgrade starter` to keep sending.",
          );
      }),
    );

  billing
    .command("upgrade <plan>")
    .description(
      `Start or change a paid plan: ${PAID_PLANS.map((plan) => plan.key).join(", ")}`,
    )
    .option("--annual", "bill yearly (two months free)")
    .option("--monthly", "bill monthly")
    .option(
      "--workspace <workspaceId>",
      "workspace public ID (defaults to the current workspace)",
    )
    .action(
      run(
        async (
          plan: string,
          opts: { annual?: boolean; monthly?: boolean; workspace?: string },
        ) => {
          ensureLoggedIn();
          if (!PAID_PLANS.some((paid) => paid.key === plan)) {
            console.error(
              `Unknown plan "${plan}". Choose one of: ${PAID_PLANS.map((paid) => paid.key).join(", ")}.`,
            );
            process.exitCode = 1;
            return;
          }
          const workspaceId = requireWorkspaceId(opts);
          const current =
            opts.annual || opts.monthly
              ? undefined
              : ok(await getBilling(workspaceId))?.interval;
          const data = ok(
            await createCheckoutLink(workspaceId, {
              plan: plan as CreateCheckoutDtoPlan,
              interval: opts.annual
                ? "year"
                : opts.monthly
                  ? "month"
                  : (current ?? "month"),
            }),
          );
          if (data) openLink(data);
        },
      ),
    );

  billing
    .command("portal")
    .description("Manage your plan, card and invoices, or cancel")
    .option(
      "--workspace <workspaceId>",
      "workspace public ID (defaults to the current workspace)",
    )
    .action(
      run(async (opts: { workspace?: string }) => {
        ensureLoggedIn();
        const data = ok(
          await createBillingPortalLink(requireWorkspaceId(opts)),
        );
        if (data) openLink(data);
      }),
    );
}
