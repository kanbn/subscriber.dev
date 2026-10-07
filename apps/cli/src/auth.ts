import { readCliConfig } from "@subscriber.dev/shared";

export function ensureLoggedIn(): void {
  if (!readCliConfig().apiKey) {
    console.error("Not logged in. Run `subscriber login` first.");
    process.exit(1);
  }
}
