import { Box, Text } from "ink";

export function Hints({ text }: { text: string }) {
  return (
    <Box marginTop={1} flexGrow={1} alignItems="flex-end">
      <Text dimColor>{text}</Text>
    </Box>
  );
}
