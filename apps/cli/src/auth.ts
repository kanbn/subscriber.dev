import { signOut } from "@subscriber.dev/api-client/cli";
import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

export function ensureLoggedIn(): void {
  if (!readCliConfig().token) {
    console.error("Not logged in. Run `subscriber login` first.");
    process.exit(1);
  }
}

export async function logout(): Promise<{ revoked: boolean }> {
  let revoked = false;
  if (readCliConfig().token) {
    revoked = await signOut().then(
      (response) => response.status === 204,
      () => false,
    );
  }
  updateCliConfig({ token: undefined });
  return { revoked };
}
