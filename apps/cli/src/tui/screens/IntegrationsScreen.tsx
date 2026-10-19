import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { UpsertIntegrationDto } from "@subscriber.dev/api-client/cli";
import {
  listIntegrations,
  upsertIntegration,
} from "@subscriber.dev/api-client/cli";

import type { CloudflareEmailCreateValues } from "../components/CloudflareEmailCreateForm.js";
import type { IntegrationCreateValues } from "../components/IntegrationCreateForm.js";
import type {
  ProviderType,
  ProviderValues,
} from "../components/ProviderForm.js";
import type { StripeIntegrationValues } from "../components/StripeIntegrationForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { CloudflareEmailCreateForm } from "../components/CloudflareEmailCreateForm.js";
import { Hints } from "../components/Hints.js";
import { IntegrationCreateForm } from "../components/IntegrationCreateForm.js";
import {
  PROVIDER_NAMES,
  providerFields,
  ProviderForm,
} from "../components/ProviderForm.js";
import { StripeIntegrationForm } from "../components/StripeIntegrationForm.js";
import {
  cloudflareIntegrationBody,
  providerIntegrationBody,
  smtpIntegrationBody,
  stripeIntegrationBody,
} from "../integrationBodies.js";
import { useAsyncData } from "../useAsyncData.js";

type Mode =
  | "list"
  | "choosing-type"
  | "creating-smtp"
  | "creating-cloudflare"
  | "creating-resend"
  | "creating-postmark"
  | "creating-ses"
  | "creating-stripe";

const CREATE_MODES: Mode[] = [
  "creating-smtp",
  "creating-cloudflare",
  "creating-resend",
  "creating-postmark",
  "creating-ses",
  "creating-stripe",
];

const WEBHOOK_HINTS: Record<ProviderType, string> = {
  resend:
    "Add the webhook signing secret after creating a webhook in Resend with the URL shown next, so bounces and spam complaints opt people out.",
  postmark:
    "Next, add a webhook in Postmark with the URL shown, for bounces and spam complaints, so they opt people out.",
  ses: "Next, subscribe the URL shown to an SNS topic that gets your SES bounce and complaint notifications, so they opt people out.",
};

export function IntegrationsScreen({
  environmentId,
  onSelect,
  createType,
  onCancelCreate,
}: {
  environmentId: string;
  onSelect: (type: string) => void;
  // Opens straight into creating this type, e.g. when setting up a trigger.
  createType?: string;
  onCancelCreate?: () => void;
}) {
  const state = useAsyncData(async () => {
    const response = await listIntegrations();
    if (response.status !== 200) {
      throw new Error("Environment not found.");
    }
    return response.data.integrations;
  }, [environmentId]);

  const [mode, setMode] = useState<Mode>(() => {
    const creating = `creating-${createType}`;
    return CREATE_MODES.includes(creating as Mode)
      ? (creating as Mode)
      : "list";
  });
  const cancelCreate = onCancelCreate ?? (() => setMode("list"));

  useInput((input) => {
    if (mode !== "list") return;
    if (input === "n" || input === "N") {
      setMode("choosing-type");
    }
  });

  const handleCreateSmtp = async (
    values: IntegrationCreateValues,
  ): Promise<string | undefined> => {
    try {
      const body = smtpIntegrationBody(values);
      const response = await upsertIntegration(
        "smtp",
        body as unknown as UpsertIntegrationDto,
      );
      if (response.status === 400) {
        return "Invalid config or failed verification.";
      }
      if (response.status !== 200) {
        return "Failed to create integration.";
      }
      onSelect("smtp");
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  const handleCreateStripe = async (
    values: StripeIntegrationValues,
  ): Promise<string | undefined> => {
    try {
      const response = await upsertIntegration(
        "stripe",
        stripeIntegrationBody(values) as unknown as UpsertIntegrationDto,
      );
      if (response.status === 400) {
        return "Invalid config, or the API key can't read Stripe customers.";
      }
      if (response.status !== 200) {
        return "Failed to create integration.";
      }
      onSelect("stripe");
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  const handleCreateCloudflare = async (
    values: CloudflareEmailCreateValues,
  ): Promise<string | undefined> => {
    try {
      const body = cloudflareIntegrationBody(values);
      const response = await upsertIntegration(
        "cloudflare",
        body as unknown as UpsertIntegrationDto,
      );
      if (response.status === 400) {
        return "Invalid config or failed verification.";
      }
      if (response.status !== 200) {
        return "Failed to create integration.";
      }
      onSelect("cloudflare");
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  const handleCreateProvider =
    (type: ProviderType) =>
    async (values: ProviderValues): Promise<string | undefined> => {
      try {
        const response = await upsertIntegration(
          type,
          providerIntegrationBody(
            providerFields(type),
            values,
          ) as UpsertIntegrationDto,
        );
        if (response.status === 400) {
          const message = (response.data as { message?: unknown } | undefined)
            ?.message;
          return typeof message === "string"
            ? message
            : "Invalid config or failed verification.";
        }
        if (response.status !== 200) {
          return "Failed to create integration.";
        }
        onSelect(type);
        return undefined;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    };

  if (mode === "choosing-type") {
    return (
      <Box flexDirection="column">
        <Text bold>New integration</Text>
        <SelectInput
          items={[
            { label: "SMTP", value: "smtp" as const },
            { label: "Resend", value: "resend" as const },
            { label: "Postmark", value: "postmark" as const },
            { label: "Amazon SES", value: "ses" as const },
            { label: "Cloudflare Email", value: "cloudflare" as const },
            { label: "Stripe (trigger workflows)", value: "stripe" as const },
          ]}
          onSelect={(item) => setMode(`creating-${item.value}`)}
        />
        <Hints text="↑↓ navigate · Enter select · Esc back · q quit" />
      </Box>
    );
  }

  if (mode === "creating-smtp") {
    return (
      <Box flexDirection="column">
        <Text bold>New SMTP integration</Text>
        <IntegrationCreateForm
          onSubmit={handleCreateSmtp}
          onCancel={cancelCreate}
        />
        <Hints text="↑↓ navigate · Enter select/edit" />
      </Box>
    );
  }

  if (mode === "creating-stripe") {
    return (
      <Box flexDirection="column">
        <Text bold>New Stripe integration</Text>
        <Text dimColor>
          Add the signing secret after creating the webhook endpoint in Stripe
          with the URL shown next. Choose which events start a workflow from the
          workflow's triggers.
        </Text>
        <StripeIntegrationForm
          onSubmit={handleCreateStripe}
          onCancel={cancelCreate}
        />
        <Hints text="↑↓ navigate · Enter select/edit" />
      </Box>
    );
  }

  if (
    mode === "creating-resend" ||
    mode === "creating-postmark" ||
    mode === "creating-ses"
  ) {
    const type = mode.replace("creating-", "") as ProviderType;
    return (
      <Box flexDirection="column">
        <Text bold>New {PROVIDER_NAMES[type]} integration</Text>
        <Text dimColor>{WEBHOOK_HINTS[type]}</Text>
        <ProviderForm
          fields={providerFields(type)}
          onSubmit={handleCreateProvider(type)}
          onCancel={cancelCreate}
        />
        <Hints text="↑↓ navigate · Enter select/edit" />
      </Box>
    );
  }

  if (mode === "creating-cloudflare") {
    return (
      <Box flexDirection="column">
        <Text bold>New Cloudflare Email integration</Text>
        <CloudflareEmailCreateForm
          onSubmit={handleCreateCloudflare}
          onCancel={cancelCreate}
        />
        <Hints text="↑↓ navigate · Enter select/edit" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Integrations</Text>
      <AsyncBoundary state={state}>
        {(integrations) =>
          integrations.length === 0 ? (
            <Text dimColor>No integrations configured.</Text>
          ) : (
            <SelectInput
              limit={10}
              items={integrations.map((integration, index) => ({
                label: `${integration.type}${index === 0 ? " (primary)" : ""}`,
                value: integration.type,
              }))}
              onSelect={(item) => onSelect(item.value)}
            />
          )
        }
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter select · n new · Esc back · q quit" />
    </Box>
  );
}
