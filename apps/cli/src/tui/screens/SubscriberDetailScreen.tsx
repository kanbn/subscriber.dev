import { Box, Text } from "ink";

import { getSubscriber } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function SubscriberDetailScreen({
  environmentId,
  subscriberId,
}: {
  environmentId: string;
  subscriberId: string;
}) {
  const state = useAsyncData(async () => {
    const response = await getSubscriber(environmentId, subscriberId);
    if (response.status !== 200) {
      throw new Error("Subscriber not found.");
    }
    return response.data;
  }, [environmentId, subscriberId]);

  return (
    <Box flexDirection="column">
      <Text bold>Subscriber</Text>
      <AsyncBoundary state={state}>
        {({ subscriber, preferences }) => {
          const fullName = [subscriber.firstName, subscriber.lastName]
            .filter(Boolean)
            .join(" ");
          const displayName =
            fullName.length > 0 ? fullName : (subscriber.name ?? "—");

          return (
            <Box flexDirection="column">
              <Text>publicId: {subscriber.publicId}</Text>
              <Text>email: {subscriber.email ?? "—"}</Text>
              <Text>phone: {subscriber.phone ?? "—"}</Text>
              <Text>externalId: {subscriber.externalId ?? "—"}</Text>
              <Text>name: {displayName}</Text>
              <Text>emailOptedIn: {String(preferences?.email ?? "—")}</Text>
            </Box>
          );
        }}
      </AsyncBoundary>
      <Hints text="Esc back · q quit" />
    </Box>
  );
}
