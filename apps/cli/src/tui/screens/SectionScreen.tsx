import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { getSetup } from "@subscriber.dev/api-client/cli";

import type { EnvironmentSummary, WorkspaceSummary } from "../navigation.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

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
      | "analytics"
      | "setup",
  ) => void;
}) {
  const setup = useAsyncData(async () => {
    const response = await getSetup();
    return response.data;
  }, [environment.publicId]);
  const incomplete = setup.status === "ready" && !setup.data.complete;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold>
        {workspace.name} / {environment.name}
      </Text>
      <SelectInput
        items={[
          ...(incomplete
            ? [{ label: "★ Get started", value: "setup" as const }]
            : []),
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
