import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { UpsertIntegrationDto } from "@subscriber.dev/api-client/cli";
import {
  listIntegrations,
  upsertIntegration,
} from "@subscriber.dev/api-client/cli";

import type { IntegrationCreateValues } from "../components/IntegrationCreateForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { IntegrationCreateForm } from "../components/IntegrationCreateForm.js";
import { useAsyncData } from "../useAsyncData.js";

type Mode = "list" | "creating";

export function IntegrationsScreen({
  environmentId,
  onSelect,
}: {
  environmentId: string;
  onSelect: (type: string) => void;
}) {
  const state = useAsyncData(async () => {
    const response = await listIntegrations(environmentId);
    if (response.status !== 200) {
      throw new Error("Environment not found.");
    }
    return response.data.integrations;
  }, [environmentId]);

  const [mode, setMode] = useState<Mode>("list");

  useInput((input) => {
    if (mode !== "list") return;
    if (input === "n" || input === "N") {
      setMode("creating");
    }
  });

  const handleCreate = async (
    values: IntegrationCreateValues,
  ): Promise<string | undefined> => {
    try {
      const body = {
        host: values.host.trim(),
        port: values.port.trim(),
        secure: values.secure,
        fromEmail: values.fromEmail.trim(),
        fromName: values.fromName.trim() || undefined,
        user: values.user.trim(),
        password: values.password,
      };
      const response = await upsertIntegration(
        environmentId,
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

  if (mode === "creating") {
    return (
      <Box flexDirection="column">
        <Text bold>New SMTP integration</Text>
        <IntegrationCreateForm
          onSubmit={handleCreate}
          onCancel={() => setMode("list")}
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
              items={integrations.map((integration) => ({
                label: integration.type,
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
