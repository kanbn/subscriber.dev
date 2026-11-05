import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { ListEnvironmentRunsResponseDtoRunsItem } from "@subscriber.dev/api-client/cli";
import { listEnvironmentRuns } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { formatRelativeTime } from "../formatRelativeTime.js";
import { stepColor, stepSummary, subscriberLabel } from "../runFormatting.js";
import { useAsyncData } from "../useAsyncData.js";
import { useListLimit } from "../useListLimit.js";

type Run = ListEnvironmentRunsResponseDtoRunsItem;

function runRowLabel(run: Run): string {
  const triggered = formatRelativeTime(run.triggeredAt as string);
  return `${run.workflow.name} — ${subscriberLabel(run.subscriber)} — ${run.status} — triggered ${triggered} — ${stepSummary(run.steps)}`;
}

export function RunHistoryScreen({ environmentId }: { environmentId: string }) {
  const listLimit = useListLimit();
  const state = useAsyncData(
    async () => {
      const response = await listEnvironmentRuns({ limit: 50 });
      if (response.status !== 200) {
        throw new Error("Environment not found.");
      }
      return response.data.runs;
    },
    [environmentId],
    { pollMs: 5000 },
  );

  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  useInput((input) => {
    if (selectedRun && (input === "b" || input === "B")) {
      setSelectedRun(null);
    }
  });

  if (selectedRun) {
    const run =
      (state.status === "ready"
        ? state.data.find((r) => r.publicId === selectedRun.publicId)
        : undefined) ?? selectedRun;
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold>Run {run.publicId}</Text>
        <Text>workflow: {run.workflow.name}</Text>
        <Text>subscriber: {subscriberLabel(run.subscriber)}</Text>
        <Text>status: {run.status}</Text>
        <Text>triggered: {formatRelativeTime(run.triggeredAt as string)}</Text>
        <Text>
          completed:{" "}
          {run.completedAt
            ? formatRelativeTime(run.completedAt as string)
            : "—"}
        </Text>
        <Text bold>Steps:</Text>
        {run.steps.map((step) => (
          <Text key={step.stepOrder} color={stepColor(step.status)}>
            {" "}
            {step.stepOrder}. {step.type} — {step.status}
            {step.sentAt
              ? ` (sent ${formatRelativeTime(step.sentAt as string)})`
              : ""}
            {step.errorMessage ? ` — ${step.errorMessage}` : ""}
          </Text>
        ))}
        <Hints text="b back · q quit" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold>
        Run History <Text dimColor>· updates every 5s</Text>
      </Text>
      <AsyncBoundary state={state}>
        {(runs) =>
          runs.length === 0 ? (
            <Text dimColor>No runs yet.</Text>
          ) : (
            <SelectInput
              limit={listLimit}
              items={runs.map((run) => ({
                label: runRowLabel(run),
                value: run.publicId,
              }))}
              onSelect={(item) => {
                const run = runs.find((r) => r.publicId === item.value);
                if (run) {
                  setSelectedRun(run);
                }
              }}
            />
          )
        }
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter view details · Esc back · q quit" />
    </Box>
  );
}
