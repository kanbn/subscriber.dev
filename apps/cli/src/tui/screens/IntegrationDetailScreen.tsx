import { Box, Text, useInput } from "ink";
import { useState } from "react";

import {
  deleteIntegration,
  getIntegration,
  setPrimaryIntegration,
} from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";
type PrimaryStatus = "idle" | "setting" | "error";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }
  return JSON.stringify(value);
}

export function IntegrationDetailScreen({
  environmentId,
  type,
  onDeleted,
}: {
  environmentId: string;
  type: string;
  onDeleted: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  const state = useAsyncData(async () => {
    const response = await getIntegration(environmentId, type);
    if (response.status !== 200) {
      throw new Error("Integration not found.");
    }
    // The response has provider-specific fields beyond what the generated
    // type declares (a known lossy conversion for open-dictionary DTOs).
    return response.data as unknown as Record<string, unknown>;
  }, [environmentId, type, refreshKey]);

  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteError, setDeleteError] = useState("");
  const [primaryStatus, setPrimaryStatus] = useState<PrimaryStatus>("idle");
  const [primaryError, setPrimaryError] = useState("");

  const isPrimary = state.status === "ready" && state.data.priority === 1;

  useInput((input) => {
    if (deleteStatus === "idle" && (input === "d" || input === "D")) {
      setDeleteStatus("confirming");
    }
    if (
      deleteStatus === "idle" &&
      primaryStatus === "idle" &&
      !isPrimary &&
      (input === "p" || input === "P")
    ) {
      void handleSetPrimary();
    }
  });

  const handleSetPrimary = async () => {
    setPrimaryStatus("setting");
    try {
      const response = await setPrimaryIntegration(environmentId, type);
      if (response.status !== 200) {
        setPrimaryError("Integration not found.");
        setPrimaryStatus("error");
        return;
      }
      setPrimaryStatus("idle");
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setPrimaryError(err instanceof Error ? err.message : String(err));
      setPrimaryStatus("error");
    }
  };

  const handleConfirmDelete = async () => {
    setDeleteStatus("deleting");
    try {
      const response = await deleteIntegration(environmentId, type);
      if (response.status === 404) {
        setDeleteError("Integration not found.");
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
      <Text bold>Integration: {type}</Text>
      <AsyncBoundary state={state}>
        {(data) => (
          <Box flexDirection="column">
            {Object.entries(data).map(([key, value]) => (
              <Text key={key}>
                {key}: {formatValue(value)}
              </Text>
            ))}
          </Box>
        )}
      </AsyncBoundary>

      {deleteStatus === "confirming" && (
        <ConfirmPrompt
          message={`Remove integration "${type}"? This cannot be undone.`}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeleteStatus("idle")}
        />
      )}
      {deleteStatus === "deleting" && <Text color="gray">Removing…</Text>}
      {deleteStatus === "error" && (
        <Text color="red">Error: {deleteError}</Text>
      )}
      {primaryStatus === "setting" && (
        <Text color="gray">Setting as primary…</Text>
      )}
      {primaryStatus === "error" && (
        <Text color="red">Error: {primaryError}</Text>
      )}

      <Hints
        text={
          deleteStatus === "idle"
            ? `d remove${isPrimary ? "" : " · p set primary"} · Esc back · q quit`
            : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
