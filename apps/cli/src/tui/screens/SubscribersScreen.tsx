import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { CreateSubscriberDto } from "@subscriber.dev/api-client/cli";
import {
  createSubscriber,
  listSubscribers,
} from "@subscriber.dev/api-client/cli";

import type { SubscriberFieldKey } from "../components/SubscriberFieldsForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { SubscriberFieldsForm } from "../components/SubscriberFieldsForm.js";
import { useAsyncData } from "../useAsyncData.js";

type Mode = "list" | "creating";

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

  const [mode, setMode] = useState<Mode>("list");

  useInput((input) => {
    if (mode !== "list") return;
    if (input === "n" || input === "N") {
      setMode("creating");
    }
  });

  const handleCreate = async (
    patch: Partial<Record<SubscriberFieldKey, string>>,
  ): Promise<string | undefined> => {
    try {
      const response = await createSubscriber(
        environmentId,
        patch as CreateSubscriberDto,
      );
      if (response.status !== 201 || !response.data.subscriber.publicId) {
        return "Failed to create subscriber.";
      }
      onSelect(response.data.subscriber.publicId);
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  if (mode === "creating") {
    return (
      <Box flexDirection="column">
        <Text bold>New subscriber</Text>
        <SubscriberFieldsForm
          initialValues={{}}
          submitLabel="Create subscriber"
          onSubmit={handleCreate}
          onCancel={() => setMode("list")}
        />
        <Hints text="↑↓ navigate · Enter select/edit" />
      </Box>
    );
  }

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
      <Hints text="↑↓ navigate · Enter select · n new · Esc back · q quit" />
    </Box>
  );
}
