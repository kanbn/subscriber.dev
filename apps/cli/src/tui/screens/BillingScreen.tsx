import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { CreateCheckoutDtoPlan } from "@subscriber.dev/api-client/cli";
import {
  createBillingPortalLink,
  createCheckoutLink,
  getBilling,
} from "@subscriber.dev/api-client/cli";
import { PAID_PLANS, yearlyPrice } from "@subscriber.dev/shared";

import type { WorkspaceSummary } from "../navigation.js";
import { billingLines } from "../../commands/billing.js";
import { openBrowser } from "../../commands/login.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function BillingScreen({ workspace }: { workspace: WorkspaceSummary }) {
  const state = useAsyncData(async () => {
    const response = await getBilling(workspace.publicId);
    if ((response.status as number) !== 200)
      throw new Error("Billing isn't available here.");
    return response.data;
  }, [workspace.publicId]);

  const [choosing, setChoosing] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [message, setMessage] = useState("");

  const open = (link: { url: string; kind: string }) => {
    if (link.kind === "changed") {
      setMessage(
        "Plan changed. The difference is charged or credited pro rata.",
      );
      return;
    }
    openBrowser(link.url);
    setMessage(
      `Opened ${link.kind === "portal" ? "the billing portal" : "Stripe Checkout"} in your browser:\n${link.url}`,
    );
  };

  const upgrade = async (plan: string) => {
    setChoosing(false);
    setMessage("Opening Stripe…");
    const response = await createCheckoutLink(workspace.publicId, {
      plan: plan as CreateCheckoutDtoPlan,
      interval: annual ? "year" : "month",
    });
    if ((response.status as number) !== 200)
      return setMessage("Couldn't start checkout.");
    open(response.data);
  };

  const portal = async () => {
    setMessage("Opening the billing portal…");
    const response = await createBillingPortalLink(workspace.publicId);
    if ((response.status as number) !== 200)
      return setMessage("No plan to manage yet. Press u to upgrade.");
    open(response.data);
  };

  useInput((input) => {
    if (choosing) {
      if (input === "a" || input === "A") setAnnual((value) => !value);
      return;
    }
    if (input === "u" || input === "U") {
      setAnnual(state.status === "ready" && state.data.interval === "year");
      setChoosing(true);
    }
    if (input === "p" || input === "P") void portal();
  });

  return (
    <Box flexDirection="column">
      <Text bold>{workspace.name} — Billing</Text>
      <AsyncBoundary state={state}>
        {(data) => (
          <Box flexDirection="column" marginTop={1}>
            {billingLines(data).map(([label, value]) => (
              <Text key={label}>
                <Text dimColor>{label.padEnd(13)}</Text>
                {value}
              </Text>
            ))}
          </Box>
        )}
      </AsyncBoundary>

      {choosing && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>
            Choose a plan · billed{" "}
            {annual ? "yearly (2 months free)" : "monthly"}
          </Text>
          <SelectInput
            items={PAID_PLANS.map((plan) => ({
              label: `${plan.key.padEnd(9)} up to ${plan.subscribers.toLocaleString("en-US").padEnd(8)} ${
                annual ? `$${yearlyPrice(plan)}/yr` : `$${plan.monthly}/mo`
              }`,
              value: plan.key,
            }))}
            onSelect={(item) => void upgrade(item.value)}
          />
        </Box>
      )}

      {message.length > 0 && (
        <Box marginTop={1}>
          <Text color="cyan">{message}</Text>
        </Box>
      )}

      <Hints
        text={
          choosing
            ? "↑↓ choose · Enter open checkout · a monthly/yearly · Esc back · q quit"
            : "u upgrade · p manage plan, card and invoices · Esc back · q quit"
        }
      />
    </Box>
  );
}
