import { Box, Text } from "ink";

import { getAnalytics } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

const DAYS = 30;

export function AnalyticsScreen({ environmentId }: { environmentId: string }) {
  const state = useAsyncData(async () => {
    const response = await getAnalytics(environmentId, { days: DAYS });
    if (response.status !== 200) {
      throw new Error("Environment not found.");
    }
    return response.data;
  }, [environmentId]);

  return (
    <Box flexDirection="column">
      <Text bold>Analytics</Text>
      <AsyncBoundary state={state}>
        {(data) => {
          const successRate = data.sends.successRate;
          return (
            <Box flexDirection="column">
              <Text bold>Subscribers:</Text>
              <Text> total: {data.subscribers.total}</Text>
              <Text>
                {" "}
                new (last {data.days}d): {data.subscribers.newInPeriod}
              </Text>
              <Text> opted out: {data.subscribers.optedOut}</Text>
              <Text>
                {" "}
                opted out (last {data.days}d):{" "}
                {data.subscribers.optedOutInPeriod}
              </Text>
              <Text bold>Sends (all time):</Text>
              <Text color="green"> sent: {data.sends.sent}</Text>
              <Text color="red"> failed: {data.sends.failed}</Text>
              <Text> skipped: {data.sends.skipped}</Text>
              <Text dimColor> pending: {data.sends.pending}</Text>
              <Text> bounced: {data.sends.bounced}</Text>
              <Text>
                {" "}
                success rate:{" "}
                {successRate == null
                  ? "—"
                  : `${(successRate * 100).toFixed(1)}%`}
              </Text>
              <Text bold>Bounces:</Text>
              <Text> hard: {data.bounces.hard}</Text>
              <Text> soft: {data.bounces.soft}</Text>
            </Box>
          );
        }}
      </AsyncBoundary>
      <Hints text="Esc back · q quit" />
    </Box>
  );
}
