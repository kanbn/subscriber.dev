import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface IntegrationCreateValues {
  host: string;
  port: string;
  secure: boolean;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  user: string;
  password: string;
}

const TEXT_FIELDS = [
  { key: "host", label: "Host", mask: false },
  { key: "port", label: "Port", mask: false },
  { key: "fromEmail", label: "From email", mask: false },
  { key: "fromName", label: "From name", mask: false },
  { key: "replyTo", label: "Reply-to email (optional)", mask: false },
  { key: "user", label: "SMTP user", mask: false },
  { key: "password", label: "SMTP password", mask: true },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"];

const SECURE_VALUE = "__secure__";
const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

type Mode = "menu" | "editing-text" | "editing-secure" | "submitting";

const SECRET_KEYS: TextFieldKey[] = ["user", "password"];

function fieldPreview(
  key: TextFieldKey,
  value: string,
  editing: boolean,
): string {
  if (value.length === 0) {
    return editing && SECRET_KEYS.includes(key) ? "(unchanged)" : "—";
  }
  const field = TEXT_FIELDS.find((f) => f.key === key);
  return field?.mask ? "•".repeat(Math.min(value.length, 8)) : value;
}

export function IntegrationCreateForm({
  onSubmit,
  onCancel,
  initialValues,
  editing = false,
}: {
  onSubmit: (values: IntegrationCreateValues) => Promise<string | undefined>;
  onCancel: () => void;
  initialValues?: Partial<IntegrationCreateValues>;
  // Editing an existing integration: blank secrets keep the stored ones.
  editing?: boolean;
}) {
  const [values, setValues] = useState<IntegrationCreateValues>({
    host: "",
    port: "",
    secure: true,
    fromEmail: "",
    fromName: "",
    replyTo: "",
    user: "",
    password: "",
    ...initialValues,
  });
  const [mode, setMode] = useState<Mode>("menu");
  const [editingField, setEditingField] = useState<TextFieldKey | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const missingSecret =
      !editing &&
      (values.user.trim().length === 0 || values.password.trim().length === 0);
    if (
      values.host.trim().length === 0 ||
      values.port.trim().length === 0 ||
      values.fromEmail.trim().length === 0 ||
      missingSecret
    ) {
      setError(
        editing
          ? "Host, port, and from email are required."
          : "Host, port, from email, user, and password are required.",
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

  if (mode === "editing-secure") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Secure connection (TLS)?</Text>
        <SelectInput
          items={[
            { label: "Yes", value: true },
            { label: "No", value: false },
          ]}
          onSelect={(item) => {
            setValues((prev) => ({ ...prev, secure: item.value }));
            setMode("menu");
          }}
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
            label: `Secure: ${values.secure ? "Yes" : "No"}`,
            value: SECURE_VALUE,
          },
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
          } else if (item.value === SECURE_VALUE) {
            setMode("editing-secure");
          } else {
            setEditingField(item.value as TextFieldKey);
            setMode("editing-text");
          }
        }}
      />
    </Box>
  );
}
