import { Box, Text } from "ink";

import { listWorkflowRuns } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function WorkflowRunsScreen({
  environmentId,
  workflowId,
}: {
  environmentId: string;
  workflowId: string;
}) {
  const state = useAsyncData(async () => {
    const response = await listWorkflowRuns(environmentId, workflowId, {
      limit: 50,
    });
    if (response.status !== 200) {
      throw new Error("Workflow not found.");
    }
    return response.data.runs;
  }, [environmentId, workflowId]);

  return (
    <Box flexDirection="column">
      <Text bold>Runs</Text>
      <AsyncBoundary state={state}>
        {(runs) =>
          runs.length === 0 ? (
            <Text dimColor>No runs yet.</Text>
          ) : (
            <Box flexDirection="column">
              {runs.map((run) => (
                <Text key={run.publicId}>
                  {run.publicId} — {run.status} ({run.steps.length} step
                  {run.steps.length === 1 ? "" : "s"})
                </Text>
              ))}
            </Box>
          )
        }
      </AsyncBoundary>
      <Hints text="Esc back · q quit" />
    </Box>
  );
}
