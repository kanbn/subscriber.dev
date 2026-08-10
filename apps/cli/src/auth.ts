import { readCliConfig } from "@subscriber.dev/shared";

export function ensureLoggedIn(): void {
  if (!readCliConfig().apiKey) {
    console.error(
      "Not logged in. Run `subscriber login --api-key <key>` first.",
    );
    process.exit(1);
  }
}
