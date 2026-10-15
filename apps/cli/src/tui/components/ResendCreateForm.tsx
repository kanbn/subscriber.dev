import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface ResendCreateValues {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  webhookSecret: string;
}

const TEXT_FIELDS = [
  { key: "apiKey", label: "API key", mask: true },
  { key: "fromEmail", label: "From email", mask: false },
  { key: "fromName", label: "From name", mask: false },
  { key: "replyTo", label: "Reply-to email (optional)", mask: false },
  {
    key: "webhookSecret",
    label: "Webhook signing secret (optional, opts out bounces and complaints)",
    mask: true,
  },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"];

const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

type Mode = "menu" | "editing-text" | "submitting";

function field(key: TextFieldKey) {
  return TEXT_FIELDS.find((f) => f.key === key) ?? TEXT_FIELDS[0];
}

function fieldPreview(
  key: TextFieldKey,
  value: string,
  editing: boolean,
): string {
  if (value.length === 0) {
    return editing && field(key).mask ? "(unchanged)" : "—";
  }
  return field(key).mask ? "•".repeat(Math.min(value.length, 8)) : value;
}

export function ResendCreateForm({
  onSubmit,
  onCancel,
  initialValues,
  editing = false,
}: {
  onSubmit: (values: ResendCreateValues) => Promise<string | undefined>;
  onCancel: () => void;
  initialValues?: Partial<ResendCreateValues>;
  editing?: boolean;
}) {
  const [values, setValues] = useState<ResendCreateValues>({
    apiKey: "",
    fromEmail: "",
    fromName: "",
    replyTo: "",
    webhookSecret: "",
    ...initialValues,
  });
  const [mode, setMode] = useState<Mode>("menu");
  const [editingField, setEditingField] = useState<TextFieldKey | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (
      values.fromEmail.trim().length === 0 ||
      (!editing && values.apiKey.trim().length === 0)
    ) {
      setError(
        editing
          ? "From email is required."
          : "API key and from email are required.",
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
    const current = field(editingField);
    return (
      <Box>
        <Text>{current.label}: </Text>
        <TextInput
          value={values[editingField]}
          onChange={(value) =>
            setValues((prev) => ({ ...prev, [editingField]: value }))
          }
          onSubmit={() => setMode("menu")}
          mask={current.mask ? "*" : undefined}
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
          ...TEXT_FIELDS.map((item) => ({
            label: `${item.label}: ${fieldPreview(item.key, values[item.key], editing)}`,
            value: item.key as string,
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
