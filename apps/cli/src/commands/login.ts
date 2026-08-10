import type { Command } from "commander";

import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

import { printResult } from "../output.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate the CLI with an API key")
    .requiredOption(
      "--api-key <key>",
      "API key from the subscriber.dev dashboard",
    )
    .option("--base-url <url>", "API base URL", "https://api.subscriber.dev")
    .action((opts: { apiKey: string; baseUrl: string }) => {
      updateCliConfig({ apiKey: opts.apiKey, apiBaseUrl: opts.baseUrl });
      console.log(`Logged in. API base URL set to ${opts.baseUrl}`);
    });

  program
    .command("logout")
    .description("Clear the stored API key")
    .action(() => {
      updateCliConfig({ apiKey: undefined });
      console.log("Logged out.");
    });

  program
    .command("whoami")
    .description("Show the current CLI configuration")
    .option("--json", "output as JSON")
    .action((opts: { json?: boolean }) => {
      const config = readCliConfig();
      printResult(
        {
          loggedIn: Boolean(config.apiKey),
          apiBaseUrl: config.apiBaseUrl,
          currentWorkspaceId: config.currentWorkspaceId,
          currentEnvironmentId: config.currentEnvironmentId,
        },
        opts,
      );
    });
}
