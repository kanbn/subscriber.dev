import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { getWorkspaces } from "@subscriber.dev/api-client/cli";

import type { WorkspaceSummary } from "../navigation.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function WorkspacesScreen({
  onSelect,
}: {
  onSelect: (workspace: WorkspaceSummary) => void;
}) {
  const state = useAsyncData(async () => {
    const response = await getWorkspaces();
    return response.data;
  }, []);

  return (
    <Box flexDirection="column">
      <Text bold>Workspaces</Text>
      <AsyncBoundary state={state}>
        {(workspaces) =>
          workspaces.length === 0 ? (
            <Text dimColor>
              No workspaces. Create one with `subscriber workspaces create`.
            </Text>
          ) : (
            <SelectInput
              limit={10}
              items={workspaces.map((workspace) => ({
                label: `${workspace.name}  (${workspace.slug})`,
                value: workspace.publicId,
              }))}
              onSelect={(item) => {
                const workspace = workspaces.find(
                  (w) => w.publicId === item.value,
                );
                if (workspace) onSelect(workspace);
              }}
            />
          )
        }
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter select · q quit" />
    </Box>
  );
}
