import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

export function ConfirmPrompt({
  message,
  confirmLabel = "Yes, delete",
  cancelLabel = "No, cancel",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{message}</Text>
      <SelectInput
        items={[
          { label: cancelLabel, value: "cancel" as const },
          { label: confirmLabel, value: "confirm" as const },
        ]}
        onSelect={(item) => {
          if (item.value === "confirm") onConfirm();
          else onCancel();
        }}
      />
    </Box>
  );
}
