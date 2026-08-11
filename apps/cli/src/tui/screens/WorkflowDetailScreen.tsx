import { Box, Text, useInput } from "ink";
import { useState } from "react";

import { deleteWorkflow, getWorkflow } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";

export function WorkflowDetailScreen({
  environmentId,
  workflowId,
  onDeleted,
}: {
  environmentId: string;
  workflowId: string;
  onDeleted: () => void;
}) {
  const state = useAsyncData(async () => {
    const response = await getWorkflow(environmentId, workflowId);
    if (response.status !== 200) {
      throw new Error("Workflow not found.");
    }
    return response.data;
  }, [environmentId, workflowId]);

  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteError, setDeleteError] = useState("");

  useInput((input) => {
    if (deleteStatus === "idle" && (input === "d" || input === "D")) {
      setDeleteStatus("confirming");
    }
  });

  const handleConfirmDelete = async () => {
    setDeleteStatus("deleting");
    try {
      const response = await deleteWorkflow(environmentId, workflowId);
      if (response.status === 404) {
        setDeleteError("Workflow not found.");
        setDeleteStatus("error");
        return;
      }
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleteStatus("error");
    }
  };

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

      {deleteStatus === "confirming" && (
        <ConfirmPrompt
          message={`Delete workflow ${workflowId}? This cannot be undone.`}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeleteStatus("idle")}
        />
      )}
      {deleteStatus === "deleting" && <Text color="gray">Deleting…</Text>}
      {deleteStatus === "error" && (
        <Text color="red">Error: {deleteError}</Text>
      )}

      <Hints
        text={
          deleteStatus === "idle"
            ? "d delete · Esc back · q quit"
            : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
