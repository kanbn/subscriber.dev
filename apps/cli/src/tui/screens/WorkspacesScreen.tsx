import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { getWorkspaces } from "@subscriber.dev/api-client/cli";

import type { WorkspaceSummary } from "../navigation.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

const ACCOUNT_VALUE = "__account__";

export function WorkspacesScreen({
  onSelectWorkspace,
  onSelectAccount,
}: {
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  onSelectAccount: () => void;
}) {
  const state = useAsyncData(async () => {
    const response = await getWorkspaces();
    return response.data;
  }, []);

  return (
    <Box flexDirection="column">
      <Text bold>Workspaces</Text>
      <AsyncBoundary state={state}>
        {(workspaces) => (
          <Box flexDirection="column">
            <SelectInput
              limit={10}
              items={[
                ...workspaces.map((workspace) => ({
                  label: `${workspace.name}  (${workspace.slug})`,
                  value: workspace.publicId,
                })),
                { label: "★ My Account", value: ACCOUNT_VALUE },
              ]}
              onSelect={(item) => {
                if (item.value === ACCOUNT_VALUE) {
                  onSelectAccount();
                  return;
                }
                const workspace = workspaces.find(
                  (w) => w.publicId === item.value,
                );
                if (workspace) onSelectWorkspace(workspace);
              }}
            />
            {workspaces.length === 0 && (
              <Text dimColor>
                No workspaces yet. Create one with `subscriber workspaces
                create`.
              </Text>
            )}
          </Box>
        )}
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter select · q quit" />
    </Box>
  );
}
