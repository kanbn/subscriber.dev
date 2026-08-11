import { Box, Text } from "ink";

import { getWorkflow } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function WorkflowDetailScreen({
  environmentId,
  workflowId,
}: {
  environmentId: string;
  workflowId: string;
}) {
  const state = useAsyncData(async () => {
    const response = await getWorkflow(environmentId, workflowId);
    if (response.status !== 200) {
      throw new Error("Workflow not found.");
    }
    return response.data;
  }, [environmentId, workflowId]);

  return (
    <Box flexDirection="column">
      <Text bold>Workflow</Text>
      <AsyncBoundary state={state}>
        {(workflow) => (
          <Box flexDirection="column">
            <Text>key: {workflow.key}</Text>
            <Text>name: {workflow.name}</Text>
            <Text>status: {workflow.status}</Text>
            <Text>description: {workflow.description ?? "—"}</Text>
            <Text bold>Steps:</Text>
            {workflow.steps.map((step) => (
              <Text key={step.publicId}>
                {" "}
                {step.stepOrder}. {step.type} (delay {step.delayMs}ms)
                {step.subject ? ` — ${step.subject}` : ""}
              </Text>
            ))}
          </Box>
        )}
      </AsyncBoundary>
      <Hints text="Esc back · q quit" />
    </Box>
  );
}
