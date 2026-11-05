import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import TextInput from "./TextInput.js";

export interface StripeIntegrationValues {
  apiKey: string;
  webhookSecret: string;
}

const AUTOMATIC_KEY_LABEL =
  "Stripe restricted key (Customers: Read, Webhook Endpoints: Write)";
export const MANUAL_KEY_LABEL = "Stripe restricted key (Customers: Read)";

type FieldKey = keyof StripeIntegrationValues;

const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

type Mode = "menu" | "editing-text" | "submitting";

export function StripeIntegrationForm({
  onSubmit,
  onCancel,
  editing = false,
  keyLabel = AUTOMATIC_KEY_LABEL,
  withSecret = false,
}: {
  onSubmit: (values: StripeIntegrationValues) => Promise<string | undefined>;
  onCancel: () => void;
  editing?: boolean;
  keyLabel?: string;
  withSecret?: boolean;
}) {
  const fields: { key: FieldKey; label: string }[] = [
    { key: "apiKey", label: keyLabel },
    ...(withSecret
      ? [{ key: "webhookSecret" as const, label: "Webhook signing secret" }]
      : []),
  ];
  const [values, setValues] = useState<StripeIntegrationValues>({
    apiKey: "",
    webhookSecret: "",
  });
  const [mode, setMode] = useState<Mode>("menu");
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [error, setError] = useState("");

  const preview = (key: FieldKey) => {
    const value = values[key];
    if (value.length === 0) return editing ? "(unchanged)" : "—";
    return "•".repeat(Math.min(value.length, 8));
  };

  const handleSubmit = async () => {
    if (!editing && values.apiKey.trim().length === 0) {
      setError("A Stripe API key is required.");
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
    return (
      <Box>
        <Text>{fields.find((f) => f.key === editingField)!.label}: </Text>
        <TextInput
          value={values[editingField]}
          onChange={(value) =>
            setValues((prev) => ({ ...prev, [editingField]: value }))
          }
          onSubmit={() => setMode("menu")}
          mask="*"
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
          ...fields.map((field) => ({
            label: `${field.label}: ${preview(field.key)}`,
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
            setEditingField(item.value as FieldKey);
            setMode("editing-text");
          }
        }}
      />
    </Box>
  );
}
