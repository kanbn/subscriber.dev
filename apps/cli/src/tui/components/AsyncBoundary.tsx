import type { ReactElement } from "react";
import { Box, Text } from "ink";

import type { AsyncState } from "../useAsyncData.js";

export function AsyncBoundary<T>({
  state,
  children,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactElement;
}): ReactElement {
  if (state.status === "loading") {
    return (
      <Box>
        <Text color="gray">Loading…</Text>
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Box>
        <Text color="red">Error: {state.message}</Text>
      </Box>
    );
  }

  return children(state.data);
}
