import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { EnvironmentSummary, WorkspaceSummary } from "../navigation.js";
import { Hints } from "../components/Hints.js";

export function SectionScreen({
  workspace,
  environment,
  onSelect,
}: {
  workspace: WorkspaceSummary;
  environment: EnvironmentSummary;
  onSelect: (
    section:
      | "subscribers"
      | "workflows"
      | "broadcastWorkflows"
      | "runHistory"
      | "integrations"
      | "analytics",
  ) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text bold>
        {workspace.name} / {environment.name}
      </Text>
      <SelectInput
        items={[
          { label: "Subscribers", value: "subscribers" as const },
          { label: "Workflows", value: "workflows" as const },
          { label: "Broadcasts", value: "broadcastWorkflows" as const },
          { label: "Run History", value: "runHistory" as const },
          { label: "Integrations", value: "integrations" as const },
          { label: "Analytics", value: "analytics" as const },
        ]}
        onSelect={(item) => onSelect(item.value)}
      />
      <Hints text="↑↓ navigate · Enter select · Esc back · q quit" />
    </Box>
  );
}
