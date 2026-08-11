import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

export function ConfirmPrompt({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{message}</Text>
      <SelectInput
        items={[
          { label: "No, cancel", value: "cancel" as const },
          { label: "Yes, delete", value: "confirm" as const },
        ]}
        onSelect={(item) => {
          if (item.value === "confirm") onConfirm();
          else onCancel();
        }}
      />
    </Box>
  );
}
