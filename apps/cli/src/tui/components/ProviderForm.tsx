import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface ProviderField {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
}

export type ProviderValues = Record<string, string>;

const SUBMIT_VALUE = "__submit__";
const CANCEL_VALUE = "__cancel__";

export const RESEND_FIELDS: ProviderField[] = [
  { key: "apiKey", label: "API key", secret: true, required: true },
  { key: "fromEmail", label: "From email", required: true },
  { key: "fromName", label: "From name" },
  { key: "replyTo", label: "Reply-to email (optional)" },
  {
    key: "webhookSecret",
    label: "Webhook signing secret (optional, opts out bounces and complaints)",
    secret: true,
  },
];

export const POSTMARK_FIELDS: ProviderField[] = [
  {
    key: "serverToken",
    label: "Server API token",
    secret: true,
    required: true,
  },
  { key: "fromEmail", label: "From email", required: true },
  { key: "fromName", label: "From name" },
  { key: "replyTo", label: "Reply-to email (optional)" },
  {
    key: "messageStream",
    label: "Message stream (optional, defaults to outbound)",
  },
];

export const SES_FIELDS: ProviderField[] = [
  { key: "region", label: "AWS region, e.g. us-east-1", required: true },
  { key: "accessKeyId", label: "Access key ID", secret: true, required: true },
  {
    key: "secretAccessKey",
    label: "Secret access key",
    secret: true,
    required: true,
  },
  { key: "fromEmail", label: "From email", required: true },
  { key: "fromName", label: "From name" },
  { key: "replyTo", label: "Reply-to email (optional)" },
  { key: "configurationSetName", label: "Configuration set (optional)" },
];

const PROVIDER_FIELDS = {
  resend: RESEND_FIELDS,
  postmark: POSTMARK_FIELDS,
  ses: SES_FIELDS,
};

export type ProviderType = keyof typeof PROVIDER_FIELDS;

export const PROVIDER_NAMES: Record<ProviderType, string> = {
  resend: "Resend",
  postmark: "Postmark",
  ses: "Amazon SES",
};

export function providerFields(type: ProviderType): ProviderField[] {
  return PROVIDER_FIELDS[type];
}

function preview(field: ProviderField, value: string, editing: boolean) {
  if (value.length === 0) return editing && field.secret ? "(unchanged)" : "—";
  return field.secret ? "•".repeat(Math.min(value.length, 8)) : value;
}

export function ProviderForm({
  fields,
  onSubmit,
  onCancel,
  initialValues,
  editing = false,
}: {
  fields: ProviderField[];
  onSubmit: (values: ProviderValues) => Promise<string | undefined>;
  onCancel: () => void;
  initialValues?: ProviderValues;
  editing?: boolean;
}) {
  const [values, setValues] = useState<ProviderValues>({
    ...Object.fromEntries(fields.map((field) => [field.key, ""])),
    ...initialValues,
  });
  const [editingField, setEditingField] = useState<ProviderField | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const missing = fields.filter(
      (field) =>
        field.required &&
        !(editing && field.secret) &&
        (values[field.key] ?? "").trim().length === 0,
    );
    if (missing.length > 0) {
      setError(`${missing.map((field) => field.label).join(", ")} required.`);
      return;
    }
    setError("");
    setSubmitting(true);
    const failure = await onSubmit(values);
    setSubmitting(false);
    if (failure) setError(failure);
  };

  if (editingField) {
    return (
      <Box>
        <Text>{editingField.label}: </Text>
        <TextInput
          value={values[editingField.key] ?? ""}
          onChange={(value) =>
            setValues((prev) => ({ ...prev, [editingField.key]: value }))
          }
          onSubmit={() => setEditingField(null)}
          mask={editingField.secret ? "*" : undefined}
        />
      </Box>
    );
  }

  if (submitting) {
    return <Text color="gray">{editing ? "Saving…" : "Creating…"}</Text>;
  }

  return (
    <Box flexDirection="column">
      {error.length > 0 && <Text color="red">{error}</Text>}
      <SelectInput
        items={[
          ...fields.map((field) => ({
            label: `${field.label}: ${preview(field, values[field.key] ?? "", editing)}`,
            value: field.key,
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
            setEditingField(
              fields.find((field) => field.key === item.value) ?? null,
            );
          }
        }}
      />
    </Box>
  );
}
