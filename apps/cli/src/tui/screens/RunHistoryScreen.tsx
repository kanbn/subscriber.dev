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

type Run = ListEnvironmentRunsResponseDtoRunsItem;
type Mode = "list" | "detail";

function runRowLabel(run: Run): string {
  const triggered = formatRelativeTime(run.triggeredAt as string);
  return `${run.workflow.name} — ${subscriberLabel(run.subscriber)} — ${run.status} — triggered ${triggered} — ${stepSummary(run.steps)}`;
}

export function RunHistoryScreen({ environmentId }: { environmentId: string }) {
  const state = useAsyncData(async () => {
    const response = await listEnvironmentRuns(environmentId, { limit: 50 });
    if (response.status !== 200) {
      throw new Error("Environment not found.");
    }
    return response.data.runs;
  }, [environmentId]);

  const [mode, setMode] = useState<Mode>("list");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  useInput((input) => {
    if (mode === "detail" && (input === "b" || input === "B")) {
      setMode("list");
      setSelectedRun(null);
    }
  });

  if (mode === "detail" && selectedRun) {
    return (
      <Box flexDirection="column">
        <Text bold>Run {selectedRun.publicId}</Text>
        <Text>workflow: {selectedRun.workflow.name}</Text>
        <Text>subscriber: {subscriberLabel(selectedRun.subscriber)}</Text>
        <Text>status: {selectedRun.status}</Text>
        <Text>
          triggered: {formatRelativeTime(selectedRun.triggeredAt as string)}
        </Text>
        <Text>
          completed:{" "}
          {selectedRun.completedAt
            ? formatRelativeTime(selectedRun.completedAt as string)
            : "—"}
        </Text>
        <Text bold>Steps:</Text>
        {selectedRun.steps.map((step) => (
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
    <Box flexDirection="column">
      <Text bold>Run History</Text>
      <AsyncBoundary state={state}>
        {(runs) =>
          runs.length === 0 ? (
            <Text dimColor>No runs yet.</Text>
          ) : (
            <SelectInput
              limit={10}
              items={runs.map((run) => ({
                label: runRowLabel(run),
                value: run.publicId,
              }))}
              onSelect={(item) => {
                const run = runs.find((r) => r.publicId === item.value);
                if (run) {
                  setSelectedRun(run);
                  setMode("detail");
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
