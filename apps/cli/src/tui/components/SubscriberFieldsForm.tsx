import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useState } from "react";

import TextInput from "./TextInput.js";

export type SubscriberFieldKey =
  "email" | "phone" | "externalId" | "firstName" | "lastName" | "name";

const FIELDS: { key: SubscriberFieldKey; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "externalId", label: "External ID" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "name", label: "Name" },
];

const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

type Mode = "menu" | "editing" | "submitting";

export function SubscriberFieldsForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValues: Partial<Record<SubscriberFieldKey, string>>;
  submitLabel: string;
  onSubmit: (
    patch: Partial<Record<SubscriberFieldKey, string>>,
  ) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<SubscriberFieldKey, string>>({
    email: initialValues.email ?? "",
    phone: initialValues.phone ?? "",
    externalId: initialValues.externalId ?? "",
    firstName: initialValues.firstName ?? "",
    lastName: initialValues.lastName ?? "",
    name: initialValues.name ?? "",
  });
  const [touched, setTouched] = useState<Set<SubscriberFieldKey>>(new Set());
  const [mode, setMode] = useState<Mode>("menu");
  const [editingField, setEditingField] = useState<SubscriberFieldKey | null>(
    null,
  );
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const patch: Partial<Record<SubscriberFieldKey, string>> = {};
    for (const field of FIELDS) {
      if (!touched.has(field.key)) continue;
      const value = values[field.key].trim();
      if (value.length > 0) patch[field.key] = value;
    }
    if (Object.keys(patch).length === 0) {
      setError("Enter at least one field.");
      return;
    }
    setError("");
    setMode("submitting");
    const failure = await onSubmit(patch);
    if (failure) {
      setError(failure);
      setMode("menu");
    }
  };

  if (mode === "editing" && editingField) {
    const field = FIELDS.find((f) => f.key === editingField);
    return (
      <Box flexDirection="column">
        <Box>
          <Text>{field?.label}: </Text>
          <TextInput
            value={values[editingField]}
            onChange={(value) =>
              setValues((prev) => ({ ...prev, [editingField]: value }))
            }
            onSubmit={() => {
              setTouched((prev) => new Set(prev).add(editingField));
              setMode("menu");
            }}
          />
        </Box>
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
          ...FIELDS.map((field) => ({
            label: `${field.label}: ${values[field.key] || "—"}`,
            value: field.key as string,
          })),
          { label: submitLabel, value: SUBMIT_VALUE },
          { label: "Cancel", value: CANCEL_VALUE },
        ]}
        onSelect={(item) => {
          if (item.value === SUBMIT_VALUE) {
            void handleSubmit();
          } else if (item.value === CANCEL_VALUE) {
            onCancel();
          } else {
            setEditingField(item.value as SubscriberFieldKey);
            setMode("editing");
          }
        }}
      />
    </Box>
  );
}
