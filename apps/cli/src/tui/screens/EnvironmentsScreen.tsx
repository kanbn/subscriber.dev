import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { listEnvironments } from "@subscriber.dev/api-client/cli";

import type { EnvironmentSummary, WorkspaceSummary } from "../navigation.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function EnvironmentsScreen({
  workspace,
  onSelect,
}: {
  workspace: WorkspaceSummary;
  onSelect: (environment: EnvironmentSummary) => void;
}) {
  const state = useAsyncData(async () => {
    const response = await listEnvironments(workspace.publicId);
    if (response.status !== 200) {
      throw new Error("Workspace not found.");
    }
    return response.data.environments;
  }, [workspace.publicId]);

  return (
    <Box flexDirection="column">
      <Text bold>{workspace.name} — Environments</Text>
      <AsyncBoundary state={state}>
        {(environments) =>
          environments.length === 0 ? (
            <Text dimColor>No environments in this workspace.</Text>
          ) : (
            <SelectInput
              limit={10}
              items={environments.map((environment) => ({
                label: `${environment.name}  (${environment.slug})`,
                value: environment.publicId,
              }))}
              onSelect={(item) => {
                const environment = environments.find(
                  (e) => e.publicId === item.value,
                );
                if (environment) onSelect(environment);
              }}
            />
          )
        }
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter select · Esc back · q quit" />
    </Box>
  );
}
