import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useState } from "react";

import {
  createEnvironment,
  getBilling,
  listEnvironments,
} from "@subscriber.dev/api-client/cli";

import type { EnvironmentSummary, WorkspaceSummary } from "../navigation.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

type Mode = "list" | "creating" | "submitting";

const BILLING_VALUE = "__billing__";

export function EnvironmentsScreen({
  workspace,
  onSelect,
  onSelectBilling,
}: {
  workspace: WorkspaceSummary;
  onSelect: (environment: EnvironmentSummary) => void;
  onSelectBilling?: () => void;
}) {
  const billing = useAsyncData(async () => {
    const response = await getBilling(workspace.publicId);
    return (response.status as number) === 200;
  }, [workspace.publicId]);
  const hasBilling =
    !!onSelectBilling && billing.status === "ready" && billing.data;

  const state = useAsyncData(async () => {
    const response = await listEnvironments(workspace.publicId);
    if (response.status !== 200) {
      throw new Error("Workspace not found.");
    }
    return response.data.environments;
  }, [workspace.publicId]);

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
      const response = await createEnvironment(workspace.publicId, {
        name: trimmed,
      });
      if (response.status !== 201) {
        setError("Failed to create environment.");
        setMode("creating");
        return;
      }
      const environment = response.data;
      if (!environment.publicId || !environment.name) {
        setError("Failed to create environment.");
        setMode("creating");
        return;
      }
      onSelect({ publicId: environment.publicId, name: environment.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMode("creating");
    }
  };

  if (mode === "creating" || mode === "submitting") {
    return (
      <Box flexDirection="column">
        <Text bold>{workspace.name} — New environment</Text>
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
      <Text bold>{workspace.name} — Environments</Text>
      <AsyncBoundary state={state}>
        {(environments) =>
          environments.length === 0 ? (
            <Text dimColor>No environments in this workspace.</Text>
          ) : (
            <SelectInput
              limit={10}
              items={[
                ...environments.map((environment) => ({
                  label: `${environment.name}  (${environment.slug})`,
                  value: environment.publicId,
                })),
                ...(hasBilling
                  ? [{ label: "Billing", value: BILLING_VALUE }]
                  : []),
              ]}
              onSelect={(item) => {
                if (item.value === BILLING_VALUE) return onSelectBilling?.();
                const environment = environments.find(
                  (e) => e.publicId === item.value,
                );
                if (environment) onSelect(environment);
              }}
            />
          )
        }
      </AsyncBoundary>
      <Hints text="↑↓ navigate · Enter select · n new · Esc back · q quit" />
    </Box>
  );
}
