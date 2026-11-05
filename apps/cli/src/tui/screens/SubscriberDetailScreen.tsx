import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type { UpdateSubscriberDto } from "@subscriber.dev/api-client/cli";
import {
  addSubscriberTag,
  deleteSubscriber,
  getSubscriber,
  removeSubscriberTag,
  updateSubscriber,
  updateSubscriberPreferences,
} from "@subscriber.dev/api-client/cli";

import type { SubscriberFieldKey } from "../components/SubscriberFieldsForm.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { SubscriberFieldsForm } from "../components/SubscriberFieldsForm.js";
import TextInput from "../components/TextInput.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";
type FieldsMode = "idle" | "editing";
type PrefsStatus = "idle" | "selecting" | "saving" | "error";
type TagsStatus = "idle" | "choosing" | "adding" | "saving" | "error";

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
    const response = await getSubscriber(subscriberId);
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

  const [tagsStatus, setTagsStatus] = useState<TagsStatus>("idle");
  const [tagInput, setTagInput] = useState("");
  const [tagsError, setTagsError] = useState("");

  const idle =
    deleteStatus === "idle" &&
    fieldsMode === "idle" &&
    prefsStatus === "idle" &&
    tagsStatus === "idle";

  useInput((input) => {
    if (prefsStatus === "error") {
      setPrefsStatus("idle");
      return;
    }
    if (tagsStatus === "error") {
      setTagsStatus("idle");
      return;
    }
    if (!idle || !subscriber) return;
    if (input === "d" || input === "D") {
      setDeleteStatus("confirming");
    } else if (input === "e" || input === "E") {
      setFieldsMode("editing");
    } else if (input === "p" || input === "P") {
      setPrefsStatus("selecting");
    } else if (input === "t" || input === "T") {
      setTagsStatus("choosing");
    }
  });

  const handleConfirmDelete = async () => {
    setDeleteStatus("deleting");
    try {
      const response = await deleteSubscriber(subscriberId);
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
      const response = await updateSubscriberPreferences(subscriberId, {
        email: optedIn,
      });
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

  const handleAddTag = async (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed.length === 0) return;

    setTagsStatus("saving");
    try {
      const response = await addSubscriberTag(subscriberId, {
        tag: trimmed,
      });
      if (response.status === 404) {
        setTagsError("Subscriber not found.");
        setTagsStatus("error");
        return;
      }
      setTagsStatus("idle");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : String(err));
      setTagsStatus("error");
    }
  };

  const handleRemoveTag = async (tag: string) => {
    setTagsStatus("saving");
    try {
      const response = await removeSubscriberTag(subscriberId, tag);
      if (response.status === 404) {
        setTagsError("Subscriber not found.");
        setTagsStatus("error");
        return;
      }
      setTagsStatus("idle");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : String(err));
      setTagsStatus("error");
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
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
            <Box flexDirection="column" flexGrow={1}>
              <Text>publicId: {loadedSubscriber.publicId}</Text>
              <Text>email: {loadedSubscriber.email ?? "—"}</Text>
              <Text>phone: {loadedSubscriber.phone ?? "—"}</Text>
              <Text>externalId: {loadedSubscriber.externalId ?? "—"}</Text>
              <Text>name: {displayName}</Text>
              <Text>emailOptedIn: {String(preferences?.email ?? "—")}</Text>
              <Text>
                tags:{" "}
                {loadedSubscriber.tags && loadedSubscriber.tags.length > 0
                  ? loadedSubscriber.tags.join(", ")
                  : "—"}
              </Text>
              <Text>createdVia: {loadedSubscriber.createdVia ?? "—"}</Text>
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

      {tagsStatus === "choosing" && subscriber && (
        <Box flexDirection="column">
          <Text color="yellow">Tags for {subscriberId}:</Text>
          <SelectInput
            items={[
              { label: "Add tag", value: "__add__" },
              ...(subscriber.tags ?? []).map((tag) => ({
                label: `Remove "${tag}"`,
                value: `remove:${tag}`,
              })),
            ]}
            onSelect={(item) => {
              if (item.value === "__add__") {
                setTagInput("");
                setTagsStatus("adding");
              } else {
                void handleRemoveTag(item.value.slice("remove:".length));
              }
            }}
          />
        </Box>
      )}
      {tagsStatus === "adding" && (
        <Box>
          <Text>Tag: </Text>
          <TextInput
            value={tagInput}
            onChange={setTagInput}
            onSubmit={(value) => void handleAddTag(value)}
          />
        </Box>
      )}
      {tagsStatus === "saving" && <Text color="gray">Saving…</Text>}
      {tagsStatus === "error" && <Text color="red">Error: {tagsError}</Text>}

      <Hints
        text={
          idle
            ? "d delete · e edit · p preferences · t tags · Esc back · q quit"
            : prefsStatus === "error" || tagsStatus === "error"
              ? "any key to continue"
              : tagsStatus === "adding"
                ? "Enter to add · Esc back"
                : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
