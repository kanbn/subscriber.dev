import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";

import type {
  ListTriggerSourcesResponseDtoSourcesItem,
  UpdateWorkflowDto,
} from "@subscriber.dev/api-client/cli";
import {
  getWorkflow,
  listTriggerSources,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { ConfirmPrompt } from "../components/ConfirmPrompt.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

interface Trigger {
  source: string;
  event: string;
}

type Mode =
  | { kind: "list" }
  | { kind: "confirm-remove"; trigger: Trigger }
  | { kind: "choosing-source" }
  | { kind: "choosing-events"; source: string; selected: string[] }
  | { kind: "entering-raw"; source: string; selected: string[] }
  | { kind: "saving" };

const ADD_VALUE = "__add__";
const RAW_VALUE = "__raw__";
const SAVE_VALUE = "__save__";
const CANCEL_VALUE = "__cancel__";

export function WorkflowTriggersScreen({
  environmentId,
  workflowId,
  pickSource,
  onSetUp,
}: {
  environmentId: string;
  workflowId: string;
  // Opens the event picker for this source, e.g. right after setting it up.
  pickSource?: string;
  onSetUp: (source: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useAsyncData(async () => {
    const [workflow, sources] = await Promise.all([
      getWorkflow(environmentId, workflowId),
      listTriggerSources(environmentId),
    ]);
    if (workflow.status !== 200) throw new Error("Workflow not found.");
    if (sources.status !== 200) throw new Error("Environment not found.");
    return { workflow: workflow.data, sources: sources.data.sources };
  }, [environmentId, workflowId, refreshKey]);

  const triggers: Trigger[] =
    state.status === "ready"
      ? state.data.workflow.triggers.map(({ source, event }) => ({
          source,
          event,
        }))
      : [];
  const eventsFor = (source: string) =>
    triggers.filter((t) => t.source === source).map((t) => t.event);

  const [mode, setMode] = useState<Mode>(
    pickSource
      ? { kind: "choosing-events", source: pickSource, selected: [] }
      : { kind: "list" },
  );
  // The picker opened from pickSource starts before the existing triggers
  // load; tick them once they have.
  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready || !pickSource) return;
    setMode((current) =>
      current.kind === "choosing-events" && current.source === pickSource
        ? { ...current, selected: eventsFor(pickSource) }
        : current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pickSource]);
  const [error, setError] = useState("");

  const save = async (next: Trigger[]) => {
    setMode({ kind: "saving" });
    setError("");
    try {
      const response = await updateWorkflow(environmentId, workflowId, {
        triggers: next,
      } as UpdateWorkflowDto);
      if (response.status !== 200) {
        const body = response.data as { message?: unknown } | undefined;
        setError(
          typeof body?.message === "string"
            ? body.message
            : "Failed to save triggers.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setMode({ kind: "list" });
    setRefreshKey((k) => k + 1);
  };

  const saveSource = (source: string, selected: string[]) =>
    save([
      ...triggers.filter((t) => t.source !== source),
      ...selected.map((event) => ({ source, event })),
    ]);

  const sourceOf = (
    sources: ListTriggerSourcesResponseDtoSourcesItem[],
    name: string,
  ) => sources.find((s) => s.source === name);

  return (
    <Box flexDirection="column">
      <Text bold>Triggers</Text>
      <Text dimColor>
        Start this workflow when a connected integration reports an event.
      </Text>
      {error.length > 0 && <Text color="red">{error}</Text>}
      <AsyncBoundary state={state}>
        {({ workflow, sources }) => {
          if (workflow.type === "broadcast") {
            return (
              <Text dimColor>
                Broadcast workflows are sent by hand, so they can't have
                triggers.
              </Text>
            );
          }

          if (mode.kind === "saving") {
            return <Text color="gray">Saving…</Text>;
          }

          if (mode.kind === "confirm-remove") {
            return (
              <ConfirmPrompt
                message={`Remove the trigger ${mode.trigger.source} · ${mode.trigger.event}?`}
                confirmLabel="Yes, remove"
                onConfirm={() =>
                  void save(
                    triggers.filter(
                      (t) =>
                        t.source !== mode.trigger.source ||
                        t.event !== mode.trigger.event,
                    ),
                  )
                }
                onCancel={() => setMode({ kind: "list" })}
              />
            );
          }

          if (mode.kind === "choosing-source") {
            return (
              <SelectInput
                items={sources.map((s) => ({
                  label: s.connected
                    ? s.name
                    : `${s.name} · not connected — set it up`,
                  value: s.source,
                }))}
                onSelect={(item) => {
                  const source = sourceOf(sources, item.value);
                  if (!source?.connected) {
                    onSetUp(item.value);
                    return;
                  }
                  setMode({
                    kind: "choosing-events",
                    source: item.value,
                    selected: eventsFor(item.value),
                  });
                }}
              />
            );
          }

          if (mode.kind === "entering-raw") {
            return <RawEventInput mode={mode} setMode={setMode} />;
          }

          if (mode.kind === "choosing-events") {
            const source = sourceOf(sources, mode.source);
            if (!source) {
              return <Text color="red">Unknown source {mode.source}.</Text>;
            }
            const named = source.events.map((e) => e.name);
            const raw = mode.selected.filter((e) => !named.includes(e));
            const toggle = (event: string) =>
              setMode({
                ...mode,
                selected: mode.selected.includes(event)
                  ? mode.selected.filter((e) => e !== event)
                  : [...mode.selected, event],
              });
            return (
              <Box flexDirection="column">
                <Text>{source.name} events that start this workflow:</Text>
                <SelectInput
                  limit={12}
                  items={[
                    ...source.events.map((e) => ({
                      label: `${mode.selected.includes(e.name) ? "[x]" : "[ ]"} ${e.label}`,
                      value: e.name,
                    })),
                    ...raw.map((event) => ({
                      label: `[x] ${event}`,
                      value: event,
                    })),
                    {
                      label: `+ Other ${source.name} event type…`,
                      value: RAW_VALUE,
                    },
                    { label: "Save", value: SAVE_VALUE },
                    { label: "Cancel", value: CANCEL_VALUE },
                  ]}
                  onSelect={(item) => {
                    if (item.value === SAVE_VALUE) {
                      void saveSource(mode.source, mode.selected);
                    } else if (item.value === CANCEL_VALUE) {
                      setMode({ kind: "list" });
                    } else if (item.value === RAW_VALUE) {
                      setMode({ ...mode, kind: "entering-raw" });
                    } else {
                      toggle(item.value);
                    }
                  }}
                />
              </Box>
            );
          }

          return (
            <Box flexDirection="column">
              {workflow.triggers.length === 0 && (
                <Text dimColor>
                  None yet. Without triggers, it only runs when triggered via
                  the API.
                </Text>
              )}
              <SelectInput
                items={[
                  ...workflow.triggers.map((t) => ({
                    label: `${sourceOf(sources, t.source)?.name ?? t.source} · ${t.label}${
                      t.active ? "" : " (inactive: integration disconnected)"
                    }`,
                    value: `${t.source}\n${t.event}`,
                  })),
                  { label: "+ Add trigger", value: ADD_VALUE },
                ]}
                onSelect={(item) => {
                  if (item.value === ADD_VALUE) {
                    setMode({ kind: "choosing-source" });
                    return;
                  }
                  const [source = "", event = ""] = item.value.split("\n");
                  setMode({
                    kind: "confirm-remove",
                    trigger: { source, event },
                  });
                }}
              />
            </Box>
          );
        }}
      </AsyncBoundary>
      <Hints
        text={
          mode.kind === "list"
            ? "↑↓ navigate · Enter remove/add · Esc back · q quit"
            : mode.kind === "choosing-events"
              ? "↑↓ navigate · Enter toggle · Esc back"
              : mode.kind === "entering-raw"
                ? "Enter to add · Esc back"
                : "↑↓ navigate · Enter select · Esc back"
        }
      />
    </Box>
  );
}

function RawEventInput({
  mode,
  setMode,
}: {
  mode: { kind: "entering-raw"; source: string; selected: string[] };
  setMode: (mode: Mode) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Box>
      <Text>Event type, e.g. checkout.session.completed: </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(submitted) => {
          const event = submitted.trim();
          setMode({
            kind: "choosing-events",
            source: mode.source,
            selected:
              event && !mode.selected.includes(event)
                ? [...mode.selected, event]
                : mode.selected,
          });
        }}
      />
    </Box>
  );
}
