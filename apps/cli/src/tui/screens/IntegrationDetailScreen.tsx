import { Box, Text, useInput } from "ink";
import { useState } from "react";

import {
  deleteIntegration,
  getIntegration,
} from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";

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
  const state = useAsyncData(async () => {
    const response = await getIntegration(environmentId, type);
    if (response.status !== 200) {
      throw new Error("Integration not found.");
    }
    // The response has provider-specific fields beyond what the generated
    // type declares (a known lossy conversion for open-dictionary DTOs).
    return response.data as unknown as Record<string, unknown>;
  }, [environmentId, type]);

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

      <Hints
        text={
          deleteStatus === "idle"
            ? "d remove · Esc back · q quit"
            : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
