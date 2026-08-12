import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useState } from "react";

import { MultilineTextInput } from "./MultilineTextInput.js";

export type WorkflowStepType = "email" | "webhook";

export interface WorkflowCreateValues {
  key: string;
  name: string;
  description: string;
  type: WorkflowStepType;
  subject: string;
  url: string;
  body: string;
}

const TEXT_FIELDS = [
  { key: "key", label: "Key" },
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"] | "subject" | "url";

const TYPE_VALUE = "__type__";
const BODY_VALUE = "__body__";
const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

type Mode =
  | "menu"
  | "editing-text"
  | "editing-type"
  | "editing-body"
  | "submitting";

function bodyPreview(body: string): string {
  if (body.trim().length === 0) return "—";
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine;
}

export function WorkflowCreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: WorkflowCreateValues) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<WorkflowCreateValues>({
    key: "",
    name: "",
    description: "",
    type: "email",
    subject: "",
    url: "",
    body: "",
  });
  const [mode, setMode] = useState<Mode>("menu");
  const [editingField, setEditingField] = useState<TextFieldKey | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (values.key.trim().length === 0 || values.name.trim().length === 0) {
      setError("Key and name are required.");
      return;
    }
    if (values.type === "email") {
      if (
        values.subject.trim().length === 0 ||
        values.body.trim().length === 0
      ) {
        setError("Subject and body are required for an email step.");
        return;
      }
    } else if (
      values.url.trim().length === 0 ||
      values.body.trim().length === 0
    ) {
      setError("URL and body are required for a webhook step.");
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

  if (mode === "editing-body") {
    return (
      <Box flexDirection="column">
        <Text>Body:</Text>
        <MultilineTextInput
          value={values.body}
          onChange={(value) => setValues((prev) => ({ ...prev, body: value }))}
          onSubmit={() => setMode("menu")}
        />
        <Text dimColor>Enter for newline · Ctrl+D to finish</Text>
      </Box>
    );
  }

  if (mode === "editing-text" && editingField) {
    const label =
      editingField === "subject"
        ? "Subject"
        : editingField === "url"
          ? "URL"
          : TEXT_FIELDS.find((f) => f.key === editingField)?.label;
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

  if (mode === "editing-type") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Step type:</Text>
        <SelectInput
          items={[
            { label: "Email", value: "email" as const },
            { label: "Webhook", value: "webhook" as const },
          ]}
          onSelect={(item) => {
            setValues((prev) => ({ ...prev, type: item.value }));
            setMode("menu");
          }}
        />
      </Box>
    );
  }

  if (mode === "submitting") {
    return <Text color="gray">Creating…</Text>;
  }

  return (
    <Box flexDirection="column">
      {error.length > 0 && <Text color="red">{error}</Text>}
      <SelectInput
        items={[
          ...TEXT_FIELDS.map((field) => ({
            label: `${field.label}: ${values[field.key] || "—"}`,
            value: field.key as string,
          })),
          {
            label: `Type: ${values.type === "email" ? "Email" : "Webhook"}`,
            value: TYPE_VALUE,
          },
          values.type === "email"
            ? {
                label: `Subject: ${values.subject || "—"}`,
                value: "subject",
              }
            : { label: `URL: ${values.url || "—"}`, value: "url" },
          { label: `Body: ${bodyPreview(values.body)}`, value: BODY_VALUE },
          { label: "Create workflow", value: SUBMIT_VALUE },
          { label: "Cancel", value: CANCEL_VALUE },
        ]}
        onSelect={(item) => {
          if (item.value === SUBMIT_VALUE) {
            void handleSubmit();
          } else if (item.value === CANCEL_VALUE) {
            onCancel();
          } else if (item.value === TYPE_VALUE) {
            setMode("editing-type");
          } else if (item.value === BODY_VALUE) {
            setMode("editing-body");
          } else {
            setEditingField(item.value as TextFieldKey);
            setMode("editing-text");
          }
        }}
      />
    </Box>
  );
}
