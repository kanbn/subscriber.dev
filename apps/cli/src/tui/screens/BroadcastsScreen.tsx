import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type {
  BroadcastDetailResponseDto,
  ListBroadcastsResponseDtoBroadcastsItem,
} from "@subscriber.dev/api-client/cli";
import {
  cancelBroadcast,
  getBroadcast,
  listBroadcasts,
  pauseBroadcast,
  redispatchBroadcast,
  resumeBroadcast,
} from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { formatRelativeTime } from "../formatRelativeTime.js";
import { useAsyncData } from "../useAsyncData.js";

type Broadcast = ListBroadcastsResponseDtoBroadcastsItem;
type Mode = "list" | "loading-detail" | "detail";
type ActionStatus =
  | "idle"
  | "confirming-cancel"
  | "confirming-redispatch"
  | "working";

const ACTIONS = {
  pause: { call: pauseBroadcast, done: "Paused." },
  resume: { call: resumeBroadcast, done: "Resumed." },
  cancel: { call: cancelBroadcast, done: "Cancelled." },
  redispatch: {
    call: redispatchBroadcast,
    done: "Setting up remaining subscribers.",
  },
} as const;

function formatSendWindow(sendOverHours: unknown): string {
  return typeof sendOverHours === "number"
    ? `spread over ${sendOverHours}h`
    : "sent immediately";
}

function broadcastRowLabel(broadcast: Broadcast): string {
  const triggered = formatRelativeTime(broadcast.createdAt as string);
  const matched = broadcast.matchedCount ?? "…";
  return `${broadcast.status} — ${matched} matched — triggered ${triggered}`;
}

export function BroadcastsScreen({
  environmentId,
  workflowId,
}: {
  environmentId: string;
  workflowId: string;
}) {
  const state = useAsyncData(async () => {
    const response = await listBroadcasts(environmentId, workflowId, {
      limit: 50,
    });
    if (response.status !== 200) {
      throw new Error("Workflow not found.");
    }
    return response.data.broadcasts;
  }, [environmentId, workflowId]);

  const [mode, setMode] = useState<Mode>("list");
  const [detail, setDetail] = useState<BroadcastDetailResponseDto | null>(null);
  const [detailError, setDetailError] = useState("");
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [actionMessage, setActionMessage] = useState("");

  const runAction = async (action: keyof typeof ACTIONS) => {
    if (!detail) return;
    setActionStatus("working");
    try {
      const response = await ACTIONS[action].call(
        environmentId,
        workflowId,
        detail.publicId,
      );
      if (response.status === 409) {
        setActionMessage(
          `Can't ${action} a broadcast that's ${detail.status}.`,
        );
      } else if (response.status !== 200) {
        setActionMessage("Broadcast not found.");
      } else {
        setActionMessage(ACTIONS[action].done);
        await loadDetail(detail.publicId);
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : String(err));
    }
    setActionStatus("idle");
  };

  useInput((input) => {
    if (mode !== "detail" || actionStatus !== "idle") return;
    const key = input.toLowerCase();
    if (key === "b") {
      setMode("list");
      setDetail(null);
      setActionMessage("");
    } else if (key === "p") {
      void runAction("pause");
    } else if (key === "r") {
      void runAction("resume");
    } else if (key === "c") {
      setActionStatus("confirming-cancel");
    } else if (key === "s") {
      setActionStatus("confirming-redispatch");
    }
  });

  const loadDetail = async (broadcastPublicId: string) => {
    const response = await getBroadcast(
      environmentId,
      workflowId,
      broadcastPublicId,
    );
    if (response.status !== 200) {
      setDetailError("Broadcast not found.");
      return false;
    }
    setDetail(response.data);
    return true;
  };

  const handleSelect = async (broadcast: Broadcast) => {
    setMode("loading-detail");
    try {
      const response = await getBroadcast(
        environmentId,
        workflowId,
        broadcast.publicId,
      );
      if (response.status !== 200) {
        setDetailError("Broadcast not found.");
        setMode("detail");
        return;
      }
      setDetail(response.data);
      setMode("detail");
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
      setMode("detail");
    }
  };

  if (mode === "loading-detail") {
    return (
      <Box flexDirection="column">
        <Text color="gray">Loading…</Text>
      </Box>
    );
  }

  if (mode === "detail") {
    return (
      <Box flexDirection="column">
        <Text bold>Broadcast</Text>
        {detail ? (
          <Box flexDirection="column">
            <Text>status: {detail.status}</Text>
            <Text>matched: {detail.matchedCount ?? "—"}</Text>
            <Text>send window: {formatSendWindow(detail.sendOverHours)}</Text>
            <Text>
              triggered: {formatRelativeTime(detail.createdAt as string)}
            </Text>
            <Text bold>Step outcomes:</Text>
            <Text color="green"> sent: {detail.sentCount}</Text>
            <Text color="red"> failed: {detail.failedCount}</Text>
            <Text> skipped: {detail.skippedCount}</Text>
            <Text dimColor> pending: {detail.pendingCount}</Text>
            <Text>
              {" "}
              bounced: {detail.bouncedCount} (hard {detail.hardBounceCount},
              soft {detail.softBounceCount})
            </Text>
            <Text>
              {" "}
              success rate:{" "}
              {detail.successRate === null
                ? "—"
                : `${(detail.successRate * 100).toFixed(1)}%`}
            </Text>
          </Box>
        ) : (
          <Text color="red">Error: {detailError}</Text>
        )}
        {actionStatus === "confirming-redispatch" && detail && (
          <ConfirmPrompt
            message="Set up every matching subscriber who hasn't been set up yet? They'll be sent this email over a fresh send window. Anyone already set up is skipped."
            confirmLabel="Yes, set them up"
            cancelLabel="No, leave it"
            onConfirm={() => void runAction("redispatch")}
            onCancel={() => setActionStatus("idle")}
          />
        )}
        {actionStatus === "confirming-cancel" && detail && (
          <ConfirmPrompt
            message="Cancel this broadcast? Every send that hasn't gone out yet will be stopped. This cannot be undone."
            confirmLabel="Yes, cancel broadcast"
            cancelLabel="No, keep it"
            onConfirm={() => void runAction("cancel")}
            onCancel={() => setActionStatus("idle")}
          />
        )}
        {actionStatus === "working" && <Text color="gray">Updating…</Text>}
        {actionMessage && actionStatus === "idle" && (
          <Text color="yellow">{actionMessage}</Text>
        )}
        <Hints
          text={
            actionStatus === "confirming-cancel" ||
            actionStatus === "confirming-redispatch"
              ? "↑↓ navigate · Enter select"
              : "p pause · r resume · c cancel · s set up missing · b back · q quit"
          }
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Broadcasts</Text>
      <AsyncBoundary state={state}>
        {(broadcasts) =>
          broadcasts.length === 0 ? (
            <Text dimColor>No broadcasts yet.</Text>
          ) : (
            <SelectInput
              limit={10}
              items={broadcasts.map((broadcast) => ({
                label: broadcastRowLabel(broadcast),
                value: broadcast.publicId,
              }))}
              onSelect={(item) => {
                const broadcast = broadcasts.find(
                  (b) => b.publicId === item.value,
                );
                if (broadcast) void handleSelect(broadcast);
              }}
            />
          )
        }
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter view details · Esc back · q quit" />
    </Box>
  );
}
