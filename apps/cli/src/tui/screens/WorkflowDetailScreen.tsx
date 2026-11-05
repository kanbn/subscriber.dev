import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type {
  TriggerBroadcastDto,
  UpdateWorkflowDto,
} from "@subscriber.dev/api-client/cli";
import {
  deleteWorkflow,
  getWorkflow,
  previewBroadcast,
  triggerBroadcast,
  triggerWorkflow,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";

import type { WorkflowMetaValues } from "../components/WorkflowMetaForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import TextInput from "../components/TextInput.js";
import { WorkflowMetaForm } from "../components/WorkflowMetaForm.js";
import { useAsyncData } from "../useAsyncData.js";

const SEND_WINDOW_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Send now", value: null },
  { label: "6 hours", value: 6 },
  { label: "24 hours", value: 24 },
  { label: "48 hours", value: 48 },
];

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";
type TriggerStatus =
  "idle" | "entering-email" | "triggering" | "success" | "error";
type MetaMode = "idle" | "editing";
type BroadcastStatus =
  | "idle"
  | "choosing-audience"
  | "entering-tag"
  | "previewing"
  | "choosing-window"
  | "confirming"
  | "triggering"
  | "success"
  | "error";

export function WorkflowDetailScreen({
  environmentId,
  workflowId,
  onDeleted,
  onViewRuns,
  onViewBroadcasts,
  onViewTriggers,
}: {
  environmentId: string;
  workflowId: string;
  onDeleted: () => void;
  onViewRuns: () => void;
  onViewBroadcasts: () => void;
  onViewTriggers: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useAsyncData(async () => {
    const response = await getWorkflow(workflowId);
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

  const [broadcastStatus, setBroadcastStatus] =
    useState<BroadcastStatus>("idle");
  const [broadcastTag, setBroadcastTag] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [pendingAudience, setPendingAudience] = useState<
    TriggerBroadcastDto["audience"] | null
  >(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pendingWindowHours, setPendingWindowHours] = useState<number | null>(
    null,
  );

  const idle =
    deleteStatus === "idle" &&
    triggerStatus === "idle" &&
    metaMode === "idle" &&
    broadcastStatus === "idle";

  useInput((input) => {
    if (triggerStatus === "success" || triggerStatus === "error") {
      setTriggerStatus("idle");
      return;
    }
    if (broadcastStatus === "success" || broadcastStatus === "error") {
      setBroadcastStatus("idle");
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
    } else if (
      (input === "b" || input === "B") &&
      workflow.type === "broadcast"
    ) {
      setBroadcastStatus("choosing-audience");
    } else if (
      (input === "h" || input === "H") &&
      workflow.type === "broadcast"
    ) {
      onViewBroadcasts();
    } else if (
      (input === "g" || input === "G") &&
      workflow.type === "automation"
    ) {
      onViewTriggers();
    }
  });

  const handleSubmitMeta = async (
    values: WorkflowMetaValues,
  ): Promise<string | undefined> => {
    try {
      const response = await updateWorkflow(workflowId, {
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
      const response = await deleteWorkflow(workflowId);
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
      const response = await triggerWorkflow({
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

  const handlePreviewBroadcast = async (
    audience: TriggerBroadcastDto["audience"],
  ) => {
    setPendingAudience(audience);
    setBroadcastStatus("previewing");
    try {
      const response = await previewBroadcast(workflowId, {
        audience,
      } as TriggerBroadcastDto);
      if (response.status === 400) {
        setBroadcastMessage("Workflow is paused or has no steps.");
        setBroadcastStatus("error");
        return;
      }
      if (response.status === 404) {
        setBroadcastMessage("Workflow not found.");
        setBroadcastStatus("error");
        return;
      }
      setPendingCount(response.data.matchedCount);
      setBroadcastStatus("choosing-window");
    } catch (err) {
      setBroadcastMessage(err instanceof Error ? err.message : String(err));
      setBroadcastStatus("error");
    }
  };

  const handleSubmitBroadcast = async () => {
    if (!pendingAudience) return;

    setBroadcastStatus("triggering");
    try {
      const response = await triggerBroadcast(workflowId, {
        audience: pendingAudience,
        sendOverHours: pendingWindowHours ?? undefined,
      } as TriggerBroadcastDto);
      if (response.status === 400) {
        setBroadcastMessage("Workflow is paused or has no steps.");
        setBroadcastStatus("error");
        return;
      }
      if (response.status === 404) {
        setBroadcastMessage("Workflow not found.");
        setBroadcastStatus("error");
        return;
      }
      setBroadcastMessage(`Broadcast queued: ${response.data.broadcastId}`);
      setBroadcastStatus("success");
    } catch (err) {
      setBroadcastMessage(err instanceof Error ? err.message : String(err));
      setBroadcastStatus("error");
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold>
        {workflow?.type === "broadcast" ? "Broadcast" : "Workflow"}
      </Text>
      <AsyncBoundary state={state}>
        {(loadedWorkflow) => (
          <Box flexDirection="column">
            <Text>key: {loadedWorkflow.key}</Text>
            <Text>name: {loadedWorkflow.name}</Text>
            <Text>status: {loadedWorkflow.status}</Text>
            <Text>description: {loadedWorkflow.description ?? "—"}</Text>
            {loadedWorkflow.type === "automation" && (
              <>
                <Text bold>Triggers:</Text>
                {(loadedWorkflow.triggers ?? []).length === 0 ? (
                  <Text dimColor> none (API only)</Text>
                ) : (
                  (loadedWorkflow.triggers ?? []).map((t) => (
                    <Text key={`${t.source}:${t.event}`} dimColor={!t.active}>
                      {" "}
                      {t.source} · {t.label}
                      {t.active ? "" : " (inactive)"}
                    </Text>
                  ))
                )}
                {(loadedWorkflow.exitConditions ?? []).length > 0 && (
                  <>
                    <Text bold>Exits when:</Text>
                    {(loadedWorkflow.exitConditions ?? []).map((t) => (
                      <Text key={`${t.source}:${t.event}`} dimColor={!t.active}>
                        {" "}
                        {t.source} · {t.label}
                        {t.active ? "" : " (inactive)"}
                      </Text>
                    ))}
                  </>
                )}
              </>
            )}
            <Text bold>Steps:</Text>
            {loadedWorkflow.steps.map((step) => (
              <Text key={step.publicId}>
                {" "}
                {step.stepOrder}. {step.type} (delay {step.delayMs}ms)
                {step.subject ? ` — ${step.subject}` : ""}
              </Text>
            ))}
            <Text bold>Send outcomes:</Text>
            <Text color="green"> sent: {loadedWorkflow.sentCount}</Text>
            <Text color="red"> failed: {loadedWorkflow.failedCount}</Text>
            <Text> skipped: {loadedWorkflow.skippedCount}</Text>
            <Text dimColor> pending: {loadedWorkflow.pendingCount}</Text>
            <Text>
              {" "}
              bounced: {loadedWorkflow.bouncedCount} (hard{" "}
              {loadedWorkflow.hardBounceCount}, soft{" "}
              {loadedWorkflow.softBounceCount})
            </Text>
            <Text>
              {" "}
              success rate:{" "}
              {loadedWorkflow.successRate === null
                ? "—"
                : `${(loadedWorkflow.successRate * 100).toFixed(1)}%`}
            </Text>
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
          <Text>
            {workflow?.type === "broadcast"
              ? "Send test to subscriber email: "
              : "Trigger for subscriber email: "}
          </Text>
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

      {broadcastStatus === "choosing-audience" && (
        <SelectInput
          items={[
            { label: "All opted-in subscribers", value: "all" as const },
            {
              label: "Opted-in subscribers with a tag",
              value: "tag" as const,
            },
          ]}
          onSelect={(item) => {
            if (item.value === "all") {
              void handlePreviewBroadcast({ type: "optedIn" });
            } else {
              setBroadcastTag("");
              setBroadcastStatus("entering-tag");
            }
          }}
        />
      )}
      {broadcastStatus === "entering-tag" && (
        <Box>
          <Text>Tag: </Text>
          <TextInput
            value={broadcastTag}
            onChange={setBroadcastTag}
            onSubmit={(value) => {
              const trimmed = value.trim();
              if (!trimmed) return;
              void handlePreviewBroadcast({
                type: "and",
                clauses: [{ type: "optedIn" }, { type: "tag", tag: trimmed }],
              });
            }}
          />
        </Box>
      )}
      {broadcastStatus === "previewing" && (
        <Text color="gray">Checking audience size…</Text>
      )}
      {broadcastStatus === "choosing-window" && (
        <Box flexDirection="column">
          <Text>Send over:</Text>
          <SelectInput
            items={SEND_WINDOW_OPTIONS}
            onSelect={(item) => {
              setPendingWindowHours(item.value);
              setBroadcastStatus("confirming");
            }}
          />
        </Box>
      )}
      {broadcastStatus === "confirming" && pendingCount !== null && (
        <ConfirmPrompt
          message={`Broadcast to ${pendingCount} matched subscriber${pendingCount === 1 ? "" : "s"}${pendingWindowHours ? `, spread over ${pendingWindowHours} hours` : " now"}? You can pause or cancel it from broadcast history.`}
          confirmLabel="Yes, send"
          onConfirm={() => void handleSubmitBroadcast()}
          onCancel={() => {
            setPendingAudience(null);
            setPendingCount(null);
            setPendingWindowHours(null);
            setBroadcastStatus("idle");
          }}
        />
      )}
      {broadcastStatus === "triggering" && (
        <Text color="gray">Triggering broadcast…</Text>
      )}
      {broadcastStatus === "success" && (
        <Text color="green">{broadcastMessage}</Text>
      )}
      {broadcastStatus === "error" && (
        <Text color="red">{broadcastMessage}</Text>
      )}

      <Hints
        text={
          idle
            ? workflow?.type === "broadcast"
              ? "d delete · e edit · t send test · b broadcast · r runs · h broadcasts · Esc back · q quit"
              : "d delete · e edit · t trigger · g triggers · r runs · Esc back · q quit"
            : triggerStatus === "success" || triggerStatus === "error"
              ? "any key to continue"
              : triggerStatus === "entering-email"
                ? workflow?.type === "broadcast"
                  ? "Enter to send test · Esc back"
                  : "Enter to trigger · Esc back"
                : broadcastStatus === "success" || broadcastStatus === "error"
                  ? "any key to continue"
                  : broadcastStatus === "entering-tag"
                    ? "Enter to trigger · Esc back"
                    : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
