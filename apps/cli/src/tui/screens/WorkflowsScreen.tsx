import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { listWorkflows } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function WorkflowsScreen({
  environmentId,
  onSelect,
}: {
  environmentId: string;
  onSelect: (workflowId: string) => void;
}) {
  const state = useAsyncData(async () => {
    const response = await listWorkflows(environmentId, { limit: 100 });
    if (response.status !== 200) {
      throw new Error("Environment not found.");
    }
    return response.data.workflows;
  }, [environmentId]);

  return (
    <Box flexDirection="column">
      <Text bold>Workflows</Text>
      <AsyncBoundary state={state}>
        {(workflows) =>
          workflows.length === 0 ? (
            <Text dimColor>No workflows in this environment.</Text>
          ) : (
            <SelectInput
              limit={10}
              items={workflows.map((workflow) => ({
                label: `${workflow.name}  (${workflow.key})  [${workflow.status}]`,
                value: workflow.publicId,
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
