import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useEffect, useRef, useState } from "react";

import { createWorkspace, getWorkspaces } from "@subscriber.dev/api-client/cli";

import type { EnvironmentSummary, WorkspaceSummary } from "../navigation.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import TextInput from "../components/TextInput.js";
import { useAsyncData } from "../useAsyncData.js";

const ACCOUNT_VALUE = "__account__";

type Mode = "list" | "creating" | "submitting" | "offer-setup";

export function WorkspacesScreen({
  onSelectWorkspace,
  onSelectAccount,
  onGetStarted,
  onSetUp,
}: {
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  onSelectAccount: () => void;
  onGetStarted: () => void;
  onSetUp: (
    workspace: WorkspaceSummary,
    environment: EnvironmentSummary,
  ) => void;
}) {
  const state = useAsyncData(async () => {
    const response = await getWorkspaces();
    return response.data;
  }, []);

  const openedSetup = useRef(false);
  const empty = state.status === "ready" && state.data.length === 0;
  useEffect(() => {
    if (empty && !openedSetup.current) {
      openedSetup.current = true;
      onGetStarted();
    }
  }, [empty, onGetStarted]);

  const [mode, setMode] = useState<Mode>("list");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    workspace: WorkspaceSummary;
    environment: EnvironmentSummary;
  } | null>(null);

  useInput((input) => {
    if (mode === "offer-setup" && created) {
      if (input === "y" || input === "Y") {
        onSetUp(created.workspace, created.environment);
      } else if (input === "n" || input === "N") {
        onSelectWorkspace(created.workspace);
      }
      return;
    }
    if (mode !== "list") return;
    if (input === "g" && empty) {
      onGetStarted();
      return;
    }
    if (input === "n" || input === "N") {
      setName("");
      setError("");
      setMode("creating");
    }
  });

  const handleCreate = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;

    setMode("submitting");
    try {
      const response = await createWorkspace({ name: trimmed });
      const workspace = response.data.workspace;
      if (!workspace.publicId || !workspace.name) {
        setError("Failed to create workspace.");
        setMode("creating");
        return;
      }
      const environment = response.data.environment;
      setCreated({
        workspace: { publicId: workspace.publicId, name: workspace.name },
        environment: { publicId: environment.publicId, name: environment.name },
      });
      setMode("offer-setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMode("creating");
    }
  };

  if (mode === "offer-setup" && created) {
    return (
      <Box flexDirection="column">
        <Text bold>Created {created.workspace.name}</Text>
        <Text>
          Set it up now? Connect an email provider and send your first email.
          (y/n)
        </Text>
      </Box>
    );
  }

  if (mode === "creating" || mode === "submitting") {
    return (
      <Box flexDirection="column">
        <Text bold>New workspace</Text>
        {error.length > 0 && <Text color="red">{error}</Text>}
        {mode === "submitting" ? (
          <Text color="gray">Creating…</Text>
        ) : (
          <Box>
            <Text>Name: </Text>
            <TextInput
              value={name}
              onChange={setName}
              onSubmit={(value) => void handleCreate(value)}
            />
          </Box>
        )}
        <Hints text="Enter to create · Esc back · q quit" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Workspaces</Text>
      <AsyncBoundary state={state}>
        {(workspaces) => (
          <Box flexDirection="column">
            <SelectInput
              limit={10}
              items={[
                ...workspaces.map((workspace) => ({
                  label: `${workspace.name}  (${workspace.slug})`,
                  value: workspace.publicId,
                })),
                { label: "★ My Account", value: ACCOUNT_VALUE },
              ]}
              onSelect={(item) => {
                if (item.value === ACCOUNT_VALUE) {
                  onSelectAccount();
                  return;
                }
                const workspace = workspaces.find(
                  (w) => w.publicId === item.value,
                );
                if (workspace) onSelectWorkspace(workspace);
              }}
            />
            {workspaces.length === 0 && (
              <Text dimColor>No workspaces yet. Press g to get set up.</Text>
            )}
          </Box>
        )}
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter select · n new · q quit" />
    </Box>
  );
}
