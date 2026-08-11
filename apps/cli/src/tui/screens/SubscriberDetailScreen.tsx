import { Box, Text, useInput } from "ink";
import { useState } from "react";

import {
  deleteSubscriber,
  getSubscriber,
} from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";

export function SubscriberDetailScreen({
  environmentId,
  subscriberId,
  onDeleted,
}: {
  environmentId: string;
  subscriberId: string;
  onDeleted: () => void;
}) {
  const state = useAsyncData(async () => {
    const response = await getSubscriber(environmentId, subscriberId);
    if (response.status !== 200) {
      throw new Error("Subscriber not found.");
    }
    return response.data;
  }, [environmentId, subscriberId]);

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
      const response = await deleteSubscriber(environmentId, subscriberId);
      if (response.status === 404) {
        setDeleteError("Subscriber not found.");
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
      <Text bold>Subscriber</Text>
      <AsyncBoundary state={state}>
        {({ subscriber, preferences }) => {
          const fullName = [subscriber.firstName, subscriber.lastName]
            .filter(Boolean)
            .join(" ");
          const displayName =
            fullName.length > 0 ? fullName : (subscriber.name ?? "—");

          return (
            <Box flexDirection="column">
              <Text>publicId: {subscriber.publicId}</Text>
              <Text>email: {subscriber.email ?? "—"}</Text>
              <Text>phone: {subscriber.phone ?? "—"}</Text>
              <Text>externalId: {subscriber.externalId ?? "—"}</Text>
              <Text>name: {displayName}</Text>
              <Text>emailOptedIn: {String(preferences?.email ?? "—")}</Text>
            </Box>
          );
        }}
      </AsyncBoundary>

      {deleteStatus === "confirming" && (
        <ConfirmPrompt
          message={`Delete subscriber ${subscriberId}? This cannot be undone.`}
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
