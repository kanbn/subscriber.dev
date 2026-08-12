import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface WorkflowMetaValues {
  name: string;
  description: string;
  status: "active" | "paused";
}

const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";
const STATUS_VALUE = "__status__";

type Mode = "menu" | "editing-text" | "editing-status" | "submitting";
type TextField = "name" | "description";

export function WorkflowMetaForm({
  initialValues,
  onSubmit,
  onCancel,
}: {
  initialValues: WorkflowMetaValues;
  onSubmit: (values: WorkflowMetaValues) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<WorkflowMetaValues>(initialValues);
  const [mode, setMode] = useState<Mode>("menu");
  const [editingField, setEditingField] = useState<TextField | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (values.name.trim().length === 0) {
      setError("Name is required.");
      return;
    }
    setError("");
    setMode("submitting");
    const failure = await onSubmit(values);
    if (failure) {
      setError(failure);
      setMode("menu");
    }
  };

  if (mode === "editing-text" && editingField) {
    const label = editingField === "name" ? "Name" : "Description";
    return (
      <Box>
        <Text>{label}: </Text>
        <TextInput
          value={values[editingField]}
          onChange={(value) =>
            setValues((prev) => ({ ...prev, [editingField]: value }))
          }
          onSubmit={() => setMode("menu")}
        />
      </Box>
    );
  }

  if (mode === "editing-status") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Status:</Text>
        <SelectInput
          items={[
            { label: "Active", value: "active" as const },
            { label: "Paused", value: "paused" as const },
          ]}
          onSelect={(item) => {
            setValues((prev) => ({ ...prev, status: item.value }));
            setMode("menu");
          }}
        />
      </Box>
    );
  }

  if (mode === "submitting") {
    return <Text color="gray">Saving…</Text>;
  }

  return (
    <Box flexDirection="column">
      {error.length > 0 && <Text color="red">{error}</Text>}
      <SelectInput
        items={[
          { label: `Name: ${values.name || "—"}`, value: "name" },
          {
            label: `Description: ${values.description || "—"}`,
            value: "description",
          },
          {
            label: `Status: ${values.status === "active" ? "Active" : "Paused"}`,
            value: STATUS_VALUE,
          },
          { label: "Save changes", value: SUBMIT_VALUE },
          { label: "Cancel", value: CANCEL_VALUE },
        ]}
        onSelect={(item) => {
          if (item.value === SUBMIT_VALUE) {
            void handleSubmit();
          } else if (item.value === CANCEL_VALUE) {
            onCancel();
          } else if (item.value === STATUS_VALUE) {
            setMode("editing-status");
          } else {
            setEditingField(item.value as TextField);
            setMode("editing-text");
          }
        }}
      />
    </Box>
  );
}
