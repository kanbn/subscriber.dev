import { revokeCurrentApiKey } from "@subscriber.dev/api-client/cli";
import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

export function ensureLoggedIn(): void {
  if (!readCliConfig().apiKey) {
    console.error("Not logged in. Run `subscriber login` first.");
    process.exit(1);
  }
}

export async function logout(): Promise<{ revoked: boolean }> {
  let revoked = false;
  if (readCliConfig().apiKey) {
    revoked = await revokeCurrentApiKey().then(
      (response) => response.status === 204,
      () => false,
    );
  }
  updateCliConfig({ apiKey: undefined });
  return { revoked };
}
