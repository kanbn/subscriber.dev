import { Box, Text, useInput } from "ink";
import { useState } from "react";

import type { UpsertIntegrationDto } from "@subscriber.dev/api-client/cli";
import {
  deleteIntegration,
  getIntegration,
  listInboundEvents,
  setPrimaryIntegration,
  upsertIntegration,
} from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { CloudflareEmailCreateForm } from "../components/CloudflareEmailCreateForm.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { IntegrationCreateForm } from "../components/IntegrationCreateForm.js";
import { StripeIntegrationForm } from "../components/StripeIntegrationForm.js";
import { formatRelativeTime } from "../formatRelativeTime.js";
import {
  cloudflareIntegrationBody,
  smtpIntegrationBody,
  stripeIntegrationBody,
} from "../integrationBodies.js";
import { useAsyncData } from "../useAsyncData.js";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";
type PrimaryStatus = "idle" | "setting" | "error";

const EDITABLE_TYPES = ["smtp", "cloudflare", "stripe"];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

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
    return response.data as unknown as Record<string, unknown>;
  }, [environmentId, type, refreshKey]);

  const inboundEvents = useAsyncData(async () => {
    const response = await listInboundEvents(environmentId, {
      source: type,
      limit: 10,
    });
    return response.status === 200 ? response.data.events : [];
  }, [environmentId, type, refreshKey]);

  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteError, setDeleteError] = useState("");
  const [primaryStatus, setPrimaryStatus] = useState<PrimaryStatus>("idle");
  const [primaryError, setPrimaryError] = useState("");

  const [editing, setEditing] = useState(false);

  const isPrimary = state.status === "ready" && state.data.priority === 1;
  const triggerCount =
    state.status === "ready" && typeof state.data.triggerCount === "number"
      ? state.data.triggerCount
      : 0;
  const canEdit = state.status === "ready" && EDITABLE_TYPES.includes(type);

  useInput((input) => {
    if (editing) return;
    if (
      deleteStatus === "idle" &&
      canEdit &&
      (input === "e" || input === "E")
    ) {
      setEditing(true);
      return;
    }
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

  const handleSave = async (
    body: Record<string, unknown>,
  ): Promise<string | undefined> => {
    try {
      const response = await upsertIntegration(
        environmentId,
        type,
        body as unknown as UpsertIntegrationDto,
      );
      if (response.status === 400) {
        return "Invalid config or failed verification.";
      }
      if (response.status !== 200) {
        return "Failed to save integration.";
      }
      setEditing(false);
      setRefreshKey((key) => key + 1);
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  if (editing && state.status === "ready") {
    const data = state.data;
    return (
      <Box flexDirection="column">
        <Text bold>Edit integration: {type}</Text>
        <Text dimColor>
          Leave secret fields blank to keep the current ones.
        </Text>
        {type === "smtp" ? (
          <IntegrationCreateForm
            editing
            initialValues={{
              host: text(data.host),
              port: data.port === undefined ? "" : String(data.port),
              secure: data.secure !== false,
              fromEmail: text(data.fromEmail),
              fromName: text(data.fromName),
              replyTo: text(data.replyTo),
            }}
            onSubmit={(values) =>
              handleSave(smtpIntegrationBody(values, { editing: true }))
            }
            onCancel={() => setEditing(false)}
          />
        ) : type === "stripe" ? (
          <StripeIntegrationForm
            editing
            onSubmit={(values) =>
              handleSave(stripeIntegrationBody(values, { editing: true }))
            }
            onCancel={() => setEditing(false)}
          />
        ) : (
          <CloudflareEmailCreateForm
            editing
            initialValues={{
              accountId: text(data.accountId),
              fromEmail: text(data.fromEmail),
              fromName: text(data.fromName),
              replyTo: text(data.replyTo),
              zoneId: text(data.zoneId),
            }}
            onSubmit={(values) =>
              handleSave(cloudflareIntegrationBody(values, { editing: true }))
            }
            onCancel={() => setEditing(false)}
          />
        )}
      </Box>
    );
  }

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

      {state.status === "ready" &&
        "webhookUrl" in state.data &&
        inboundEvents.status === "ready" &&
        (() => {
          const events = inboundEvents.data;
          return (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Recent events</Text>
              {events.length === 0 ? (
                <Text dimColor>
                  None yet. Point a webhook at webhookUrl, sending the events in
                  eventsToEnable, then add triggers to your workflows.
                </Text>
              ) : (
                events.map((event) => (
                  <Text key={event.externalEventId}>
                    {formatRelativeTime(event.createdAt as string)} {event.type}
                    {" → "}
                    {event.status}
                    {event.outcome ? `: ${event.outcome}` : ""}
                  </Text>
                ))
              )}
            </Box>
          );
        })()}

      {deleteStatus === "confirming" && (
        <ConfirmPrompt
          message={`Remove integration "${type}"? This cannot be undone.${
            triggerCount > 0
              ? ` ${triggerCount} workflow trigger${triggerCount === 1 ? "" : "s"} will stop until it's reconnected.`
              : ""
          }`}
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
            ? `${canEdit ? "e edit · " : ""}d remove${isPrimary ? "" : " · p set primary"} · Esc back · q quit`
            : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
