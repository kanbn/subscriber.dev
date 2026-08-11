import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { UpdateSubscriberDto } from "@subscriber.dev/api-client/cli";
import {
  deleteSubscriber,
  getSubscriber,
  updateSubscriber,
  updateSubscriberPreferences,
} from "@subscriber.dev/api-client/cli";

import type { SubscriberFieldKey } from "../components/SubscriberFieldsForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { SubscriberFieldsForm } from "../components/SubscriberFieldsForm.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";
type FieldsMode = "idle" | "editing";
type PrefsStatus = "idle" | "selecting" | "saving" | "error";

export function SubscriberDetailScreen({
  environmentId,
  subscriberId,
  onDeleted,
}: {
  environmentId: string;
  subscriberId: string;
  onDeleted: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useAsyncData(async () => {
    const response = await getSubscriber(environmentId, subscriberId);
    if (response.status !== 200) {
      throw new Error("Subscriber not found.");
    }
    return response.data;
  }, [environmentId, subscriberId, refreshKey]);
  const subscriber = state.status === "ready" ? state.data.subscriber : null;

  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteError, setDeleteError] = useState("");

  const [fieldsMode, setFieldsMode] = useState<FieldsMode>("idle");

  const [prefsStatus, setPrefsStatus] = useState<PrefsStatus>("idle");
  const [prefsError, setPrefsError] = useState("");

  const idle =
    deleteStatus === "idle" && fieldsMode === "idle" && prefsStatus === "idle";

  useInput((input) => {
    if (prefsStatus === "error") {
      setPrefsStatus("idle");
      return;
    }
    if (!idle || !subscriber) return;
    if (input === "d" || input === "D") {
      setDeleteStatus("confirming");
    } else if (input === "e" || input === "E") {
      setFieldsMode("editing");
    } else if (input === "p" || input === "P") {
      setPrefsStatus("selecting");
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

  const handleSubmitFields = async (
    patch: Partial<Record<SubscriberFieldKey, string>>,
  ): Promise<string | undefined> => {
    try {
      const response = await updateSubscriber(
        environmentId,
        subscriberId,
        patch as UpdateSubscriberDto,
      );
      if (response.status === 404) {
        return "Subscriber not found.";
      }
      setFieldsMode("idle");
      setRefreshKey((k) => k + 1);
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  const handleSetPreferences = async (optedIn: boolean) => {
    setPrefsStatus("saving");
    try {
      const response = await updateSubscriberPreferences(
        environmentId,
        subscriberId,
        { email: optedIn },
      );
      if (response.status === 404) {
        setPrefsError("Subscriber not found.");
        setPrefsStatus("error");
        return;
      }
      setPrefsStatus("idle");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : String(err));
      setPrefsStatus("error");
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold>Subscriber</Text>
      <AsyncBoundary state={state}>
        {({ subscriber: loadedSubscriber, preferences }) => {
          const fullName = [
            loadedSubscriber.firstName,
            loadedSubscriber.lastName,
          ]
            .filter(Boolean)
            .join(" ");
          const displayName =
            fullName.length > 0 ? fullName : (loadedSubscriber.name ?? "—");

          return (
            <Box flexDirection="column">
              <Text>publicId: {loadedSubscriber.publicId}</Text>
              <Text>email: {loadedSubscriber.email ?? "—"}</Text>
              <Text>phone: {loadedSubscriber.phone ?? "—"}</Text>
              <Text>externalId: {loadedSubscriber.externalId ?? "—"}</Text>
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

      {fieldsMode === "editing" && subscriber && (
        <SubscriberFieldsForm
          initialValues={{
            email: subscriber.email ?? "",
            phone: subscriber.phone ?? "",
            externalId: subscriber.externalId ?? "",
            firstName: subscriber.firstName ?? "",
            lastName: subscriber.lastName ?? "",
            name: subscriber.name ?? "",
          }}
          submitLabel="Save changes"
          onSubmit={handleSubmitFields}
          onCancel={() => setFieldsMode("idle")}
        />
      )}

      {prefsStatus === "selecting" && (
        <Box flexDirection="column">
          <Text color="yellow">Set email opt-in for {subscriberId}:</Text>
          <SelectInput
            items={[
              { label: "Opted in", value: "in" as const },
              { label: "Opted out", value: "out" as const },
            ]}
            onSelect={(item) => void handleSetPreferences(item.value === "in")}
          />
        </Box>
      )}
      {prefsStatus === "saving" && <Text color="gray">Saving…</Text>}
      {prefsStatus === "error" && <Text color="red">Error: {prefsError}</Text>}

      <Hints
        text={
          idle
            ? "d delete · e edit · p preferences · Esc back · q quit"
            : prefsStatus === "error"
              ? "any key to continue"
              : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
