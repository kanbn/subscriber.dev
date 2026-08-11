import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { listIntegrations } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

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
      <Hints text="↑↓ navigate · Enter select · Esc back · q quit" />
    </Box>
  );
}
