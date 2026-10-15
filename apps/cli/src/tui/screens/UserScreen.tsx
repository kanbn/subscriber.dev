import { Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useState } from "react";

import {
  getCurrentUser,
  updateCurrentUser,
} from "@subscriber.dev/api-client/cli";

import { logout } from "../../auth.js";
import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

type EditMode =
  | "idle"
  | "menu"
  | "editing-text"
  | "submitting"
  | "confirm-logout"
  | "logging-out";
type TextField = "name" | "image";

const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

export function UserScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useAsyncData(async () => {
    const response = await getCurrentUser();
    return response.data;
  }, [refreshKey]);
  const user = state.status === "ready" ? state.data : null;

  const [editMode, setEditMode] = useState<EditMode>("idle");
  const [values, setValues] = useState({ name: "", image: "" });
  const [editingField, setEditingField] = useState<TextField | null>(null);
  const [error, setError] = useState("");
  const { exit } = useApp();

  useInput((input) => {
    if (editMode === "confirm-logout") {
      if (input === "y" || input === "Y") {
        setEditMode("logging-out");
        void logout().then(() => exit());
      } else {
        setEditMode("idle");
      }
      return;
    }
    if (editMode !== "idle") return;
    if (input === "l" || input === "L") {
      setEditMode("confirm-logout");
      return;
    }
    if (!user) return;
    if (input === "e" || input === "E") {
      setValues({ name: user.name ?? "", image: user.image ?? "" });
      setError("");
      setEditMode("menu");
    }
  });

  const handleSubmit = async () => {
    setEditMode("submitting");
    try {
      await updateCurrentUser({ name: values.name, image: values.image });
      setEditMode("idle");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEditMode("menu");
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold>My Account</Text>
      <AsyncBoundary state={state}>
        {(loadedUser) => (
          <Box flexDirection="column">
            <Text>publicId: {loadedUser.publicId}</Text>
            <Text>name: {loadedUser.name ?? "—"}</Text>
            <Text>email: {loadedUser.email}</Text>
            <Text>image: {loadedUser.image ?? "—"}</Text>
          </Box>
        )}
      </AsyncBoundary>

      {editMode === "editing-text" && editingField && (
        <Box>
          <Text>{editingField === "name" ? "Name" : "Image URL"}: </Text>
          <TextInput
            value={values[editingField]}
            onChange={(value) =>
              setValues((prev) => ({ ...prev, [editingField]: value }))
            }
            onSubmit={() => setEditMode("menu")}
          />
        </Box>
      )}

      {editMode === "menu" && (
        <Box flexDirection="column">
          {error.length > 0 && <Text color="red">{error}</Text>}
          <SelectInput
            items={[
              { label: `Name: ${values.name || "—"}`, value: "name" },
              { label: `Image URL: ${values.image || "—"}`, value: "image" },
              { label: "Save changes", value: SUBMIT_VALUE },
              { label: "Cancel", value: CANCEL_VALUE },
            ]}
            onSelect={(item) => {
              if (item.value === SUBMIT_VALUE) {
                void handleSubmit();
              } else if (item.value === CANCEL_VALUE) {
                setEditMode("idle");
              } else {
                setEditingField(item.value as TextField);
                setEditMode("editing-text");
              }
            }}
          />
        </Box>
      )}

      {editMode === "submitting" && <Text color="gray">Saving…</Text>}

      {editMode === "confirm-logout" && (
        <Text color="yellow">
          Log out and revoke this machine&apos;s API key? (y/n)
        </Text>
      )}

      {editMode === "logging-out" && <Text color="gray">Logging out…</Text>}

      <Hints
        text={
          editMode === "idle"
            ? "e edit · l log out · Esc back · q quit"
            : "↑↓ navigate · Enter select"
        }
      />
    </Box>
  );
}
