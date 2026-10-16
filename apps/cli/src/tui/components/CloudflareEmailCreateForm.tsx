import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import TextInput from "./TextInput.js";

export interface CloudflareEmailCreateValues {
  accountId: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  apiToken: string;
  zoneId: string;
}

const TEXT_FIELDS = [
  { key: "accountId", label: "Account ID", mask: false },
  { key: "fromEmail", label: "From email", mask: false },
  { key: "fromName", label: "From name", mask: false },
  { key: "replyTo", label: "Reply-to email (optional)", mask: false },
  { key: "apiToken", label: "API token", mask: true },
  {
    key: "zoneId",
    label: "Zone ID (optional, enables precise bounce detection)",
    mask: false,
  },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"];

const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

type Mode = "menu" | "editing-text" | "submitting";

function fieldPreview(
  key: TextFieldKey,
  value: string,
  editing: boolean,
): string {
  if (value.length === 0) {
    return editing && key === "apiToken" ? "(unchanged)" : "—";
  }
  const field = TEXT_FIELDS.find((f) => f.key === key);
  return field?.mask ? "•".repeat(Math.min(value.length, 8)) : value;
}

export function CloudflareEmailCreateForm({
  onSubmit,
  onCancel,
  initialValues,
  editing = false,
}: {
  onSubmit: (
    values: CloudflareEmailCreateValues,
  ) => Promise<string | undefined>;
  onCancel: () => void;
  initialValues?: Partial<CloudflareEmailCreateValues>;
  // Editing an existing integration: a blank API token keeps the stored one.
  editing?: boolean;
}) {
  const [values, setValues] = useState<CloudflareEmailCreateValues>({
    accountId: "",
    fromEmail: "",
    fromName: "",
    replyTo: "",
    apiToken: "",
    zoneId: "",
    ...initialValues,
  });
  const [mode, setMode] = useState<Mode>("menu");
  const [editingField, setEditingField] = useState<TextFieldKey | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (
      values.accountId.trim().length === 0 ||
      values.fromEmail.trim().length === 0 ||
      (!editing && values.apiToken.trim().length === 0)
    ) {
      setError(
        editing
          ? "Account ID and from email are required."
          : "Account ID, from email, and API token are required.",
      );
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
    const field = TEXT_FIELDS.find((f) => f.key === editingField);
    if (!field) return null;
    return (
      <Box>
        <Text>{field.label}: </Text>
        <TextInput
          value={values[editingField]}
          onChange={(value) =>
            setValues((prev) => ({ ...prev, [editingField]: value }))
          }
          onSubmit={() => setMode("menu")}
          mask={field.mask ? "*" : undefined}
        />
      </Box>
    );
  }

  if (mode === "submitting") {
    return <Text color="gray">{editing ? "Saving…" : "Creating…"}</Text>;
  }

  return (
    <Box flexDirection="column">
      {error.length > 0 && <Text color="red">{error}</Text>}
      <SelectInput
        items={[
          ...TEXT_FIELDS.map((field) => ({
            label: `${field.label}: ${fieldPreview(field.key, values[field.key], editing)}`,
            value: field.key as string,
          })),
          {
            label: editing ? "Save changes" : "Create integration",
            value: SUBMIT_VALUE,
          },
          { label: "Cancel", value: CANCEL_VALUE },
        ]}
        onSelect={(item) => {
          if (item.value === SUBMIT_VALUE) {
            void handleSubmit();
          } else if (item.value === CANCEL_VALUE) {
            onCancel();
          } else {
            setEditingField(item.value as TextFieldKey);
            setMode("editing-text");
          }
        }}
      />
    </Box>
  );
}
