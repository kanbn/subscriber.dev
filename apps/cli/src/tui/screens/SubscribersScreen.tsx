import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { listSubscribers } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function SubscribersScreen({
  environmentId,
  onSelect,
}: {
  environmentId: string;
  onSelect: (subscriberId: string) => void;
}) {
  const state = useAsyncData(async () => {
    const response = await listSubscribers(environmentId, { limit: 100 });
    if (response.status !== 200) {
      throw new Error("Environment not found.");
    }
    return response.data.subscribers;
  }, [environmentId]);

  return (
    <Box flexDirection="column">
      <Text bold>Subscribers</Text>
      <AsyncBoundary state={state}>
        {(subscribers) =>
          subscribers.length === 0 ? (
            <Text dimColor>No subscribers in this environment.</Text>
          ) : (
            <SelectInput
              limit={10}
              items={subscribers.map((subscriber) => ({
                label:
                  subscriber.email ??
                  subscriber.name ??
                  subscriber.externalId ??
                  subscriber.publicId,
                value: subscriber.publicId,
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
