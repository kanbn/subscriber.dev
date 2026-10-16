import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import { createWorkspace, getWorkspaces } from "@subscriber.dev/api-client/cli";

import type { WorkspaceSummary } from "../navigation.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import TextInput from "../components/TextInput.js";
import { useAsyncData } from "../useAsyncData.js";

const ACCOUNT_VALUE = "__account__";

type Mode = "list" | "creating" | "submitting";

export function WorkspacesScreen({
  onSelectWorkspace,
  onSelectAccount,
}: {
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  onSelectAccount: () => void;
}) {
  const state = useAsyncData(async () => {
    const response = await getWorkspaces();
    return response.data;
  }, []);

  const [mode, setMode] = useState<Mode>("list");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useInput((input) => {
    if (mode !== "list") return;
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
      onSelectWorkspace({ publicId: workspace.publicId, name: workspace.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMode("creating");
    }
  };

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
              <Text dimColor>
                No workspaces yet. Create one with `subscriber workspaces
                create`.
              </Text>
            )}
          </Box>
        )}
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter select · n new · q quit" />
    </Box>
  );
}
