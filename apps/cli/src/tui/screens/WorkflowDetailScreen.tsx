import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

import type { UpdateWorkflowDto } from "@subscriber.dev/api-client/cli";
import {
  deleteWorkflow,
  getWorkflow,
  triggerWorkflow,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";

import type { WorkflowMetaValues } from "../components/WorkflowMetaForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { WorkflowMetaForm } from "../components/WorkflowMetaForm.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";
type TriggerStatus =
  | "idle"
  | "entering-email"
  | "triggering"
  | "success"
  | "error";
type MetaMode = "idle" | "editing";

export function WorkflowDetailScreen({
  environmentId,
  workflowId,
  onDeleted,
  onViewRuns,
}: {
  environmentId: string;
  workflowId: string;
  onDeleted: () => void;
  onViewRuns: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useAsyncData(async () => {
    const response = await getWorkflow(environmentId, workflowId);
    if (response.status !== 200) {
      throw new Error("Workflow not found.");
    }
    return response.data;
  }, [environmentId, workflowId, refreshKey]);
  const workflow = state.status === "ready" ? state.data : null;

  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteError, setDeleteError] = useState("");

  const [triggerStatus, setTriggerStatus] = useState<TriggerStatus>("idle");
  const [triggerEmail, setTriggerEmail] = useState("");
  const [triggerMessage, setTriggerMessage] = useState("");

  const [metaMode, setMetaMode] = useState<MetaMode>("idle");

  const idle =
    deleteStatus === "idle" && triggerStatus === "idle" && metaMode === "idle";

  useInput((input) => {
    if (triggerStatus === "success" || triggerStatus === "error") {
      setTriggerStatus("idle");
      return;
    }
    if (!idle || !workflow) return;
    if (input === "d" || input === "D") {
      setDeleteStatus("confirming");
    } else if (input === "t" || input === "T") {
      setTriggerEmail("");
      setTriggerStatus("entering-email");
    } else if (input === "r" || input === "R") {
      onViewRuns();
    } else if (input === "e" || input === "E") {
      setMetaMode("editing");
    }
  });

  const handleSubmitMeta = async (
    values: WorkflowMetaValues,
  ): Promise<string | undefined> => {
    try {
      const response = await updateWorkflow(environmentId, workflowId, {
        name: values.name.trim(),
        description: values.description.trim() || null,
        status: values.status,
      } as UpdateWorkflowDto);
      if (response.status === 404) {
        return "Workflow not found.";
      }
      setMetaMode("idle");
      setRefreshKey((k) => k + 1);
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

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

  const handleSubmitTrigger = async (email: string) => {
    const trimmed = email.trim();
    if (!workflow || trimmed.length === 0) return;

    setTriggerStatus("triggering");
    try {
      const response = await triggerWorkflow(environmentId, {
        key: workflow.key,
        subscriber: { email: trimmed },
        payload: {},
      });
      if (response.status === 404) {
        setTriggerMessage("Workflow or subscriber not found.");
        setTriggerStatus("error");
        return;
      }
      setTriggerMessage(
        response.data.triggered
          ? `Triggered. Run: ${response.data.runPublicId ?? "—"}`
          : `Not triggered: ${response.data.reason ?? "unknown reason"}`,
      );
      setTriggerStatus("success");
    } catch (err) {
      setTriggerMessage(err instanceof Error ? err.message : String(err));
      setTriggerStatus("error");
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold>Workflow</Text>
      <AsyncBoundary state={state}>
        {(loadedWorkflow) => (
          <Box flexDirection="column">
            <Text>key: {loadedWorkflow.key}</Text>
            <Text>name: {loadedWorkflow.name}</Text>
            <Text>status: {loadedWorkflow.status}</Text>
            <Text>description: {loadedWorkflow.description ?? "—"}</Text>
            <Text bold>Steps:</Text>
            {loadedWorkflow.steps.map((step) => (
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

      {triggerStatus === "entering-email" && (
        <Box>
          <Text>Trigger for subscriber email: </Text>
          <TextInput
            value={triggerEmail}
            onChange={setTriggerEmail}
            onSubmit={(value) => void handleSubmitTrigger(value)}
          />
        </Box>
      )}
      {triggerStatus === "triggering" && <Text color="gray">Triggering…</Text>}
      {triggerStatus === "success" && (
        <Text color="green">{triggerMessage}</Text>
      )}
      {triggerStatus === "error" && <Text color="red">{triggerMessage}</Text>}

      {metaMode === "editing" && workflow && (
        <WorkflowMetaForm
          initialValues={{
            name: workflow.name,
            description: workflow.description ?? "",
            status: workflow.status,
          }}
          onSubmit={handleSubmitMeta}
          onCancel={() => setMetaMode("idle")}
        />
      )}

      <Hints
        text={
          idle
            ? "d delete · e edit · t trigger · r runs · Esc back · q quit"
            : triggerStatus === "success" || triggerStatus === "error"
              ? "any key to continue"
              : triggerStatus === "entering-email"
                ? "Enter to trigger · Esc back"
                : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
