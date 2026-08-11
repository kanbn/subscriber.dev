import { Box, Text } from "ink";

export function Hints({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}
