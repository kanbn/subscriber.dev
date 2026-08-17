import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import type {
  BroadcastDetailResponseDto,
  ListBroadcastsResponseDtoBroadcastsItem,
} from "@subscriber.dev/api-client/cli";
import { getBroadcast, listBroadcasts } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { formatRelativeTime } from "../formatRelativeTime.js";
import { useAsyncData } from "../useAsyncData.js";

type Broadcast = ListBroadcastsResponseDtoBroadcastsItem;
type Mode = "list" | "loading-detail" | "detail";

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

  useInput((input) => {
    if (mode === "detail" && (input === "b" || input === "B")) {
      setMode("list");
      setDetail(null);
    }
  });

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
            <Text>
              triggered: {formatRelativeTime(detail.createdAt as string)}
            </Text>
            <Text bold>Step outcomes:</Text>
            <Text color="green"> sent: {detail.sentCount}</Text>
            <Text color="red"> failed: {detail.failedCount}</Text>
            <Text> skipped: {detail.skippedCount}</Text>
            <Text dimColor> pending: {detail.pendingCount}</Text>
          </Box>
        ) : (
          <Text color="red">Error: {detailError}</Text>
        )}
        <Hints text="b back · q quit" />
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
