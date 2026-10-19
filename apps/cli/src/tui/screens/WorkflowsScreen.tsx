import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { CreateWorkflowDto } from "@subscriber.dev/api-client/cli";
import { createWorkflow, listWorkflows } from "@subscriber.dev/api-client/cli";

import type { WorkflowCreateValues } from "../components/WorkflowCreateForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { WorkflowCreateForm } from "../components/WorkflowCreateForm.js";
import { useAsyncData } from "../useAsyncData.js";

type Mode = "list" | "creating";

export function WorkflowsScreen({
  environmentId,
  workflowType,
  onSelect,
}: {
  environmentId: string;
  workflowType: "automation" | "broadcast";
  onSelect: (workflowId: string) => void;
}) {
  const state = useAsyncData(async () => {
    const response = await listWorkflows({
      limit: 100,
      type: workflowType,
    });
    if (response.status !== 200) {
      throw new Error("Environment not found.");
    }
    return response.data.workflows;
  }, [environmentId, workflowType]);

  const [mode, setMode] = useState<Mode>("list");
  const title = workflowType === "broadcast" ? "Broadcasts" : "Workflows";

  useInput((input) => {
    if (mode !== "list") return;
    if (input === "n" || input === "N") {
      setMode("creating");
    }
  });

  const handleCreate = async (
    values: WorkflowCreateValues,
  ): Promise<string | undefined> => {
    try {
      const step: CreateWorkflowDto["steps"][number] =
        values.type === "email"
          ? {
              type: "email",
              subject: values.subject.trim(),
              body: values.body,
            }
          : { type: "webhook", url: values.url.trim(), body: values.body };

      const response = await createWorkflow({
        key: values.key.trim(),
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        type: workflowType,
        steps: [step],
      });
      if (response.status !== 201) {
        return "Failed to create workflow.";
      }
      onSelect(response.data.publicId);
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  if (mode === "creating") {
    return (
      <Box flexDirection="column">
        <Text bold>
          New {workflowType === "broadcast" ? "broadcast" : "workflow"}
        </Text>
        <WorkflowCreateForm
          onSubmit={handleCreate}
          onCancel={() => setMode("list")}
        />
        <Hints text="↑↓ navigate · Enter select/edit" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <AsyncBoundary state={state}>
        {(workflows) =>
          workflows.length === 0 ? (
            <Text dimColor>
              No {workflowType === "broadcast" ? "broadcasts" : "workflows"} in
              this environment.
            </Text>
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
      <Hints text="↑↓ navigate · Enter select · n new · Esc back · q quit" />
    </Box>
  );
}
