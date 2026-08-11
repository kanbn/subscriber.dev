import { Box, Text } from "ink";

import { getCurrentUser } from "@subscriber.dev/api-client/cli";

import { AsyncBoundary } from "../components/AsyncBoundary.js";
import { Hints } from "../components/Hints.js";
import { useAsyncData } from "../useAsyncData.js";

export function UserScreen() {
  const state = useAsyncData(async () => {
    const response = await getCurrentUser();
    return response.data;
  }, []);

  return (
    <Box flexDirection="column">
      <Text bold>My Account</Text>
      <AsyncBoundary state={state}>
        {(user) => (
          <Box flexDirection="column">
            <Text>publicId: {user.publicId}</Text>
            <Text>name: {user.name ?? "—"}</Text>
            <Text>email: {user.email}</Text>
            <Text>image: {user.image ?? "—"}</Text>
          </Box>
        )}
      </AsyncBoundary>
      <Hints text="Esc back · q quit" />
    </Box>
  );
}
