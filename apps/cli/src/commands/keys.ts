import type { Command } from "commander";
import { Option } from "commander";

import type { CreateEnvironmentKeyDto } from "@subscriber.dev/api-client/cli";
import {
  createEnvironmentKey,
  listEnvironmentKeys,
  revokeEnvironmentKey,
} from "@subscriber.dev/api-client/cli";
import { ALL_ENVIRONMENT_KEY_SCOPES } from "@subscriber.dev/shared/environmentKeys";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

const ENVIRONMENT_OPTION = [
  "--environment <environmentId>",
  "environment public ID (defaults to the current environment)",
] as const;

export function registerKeysCommand(program: Command): void {
  const keys = program
    .command("keys")
    .description("Manage API keys, for your app to call the API with");

  keys
    .command("create <name>")
    .description("Create an API key. It's only shown once.")
    .option(...ENVIRONMENT_OPTION)
    .addOption(
      new Option(
        "--access <access>",
        "limited: trigger workflows and create or update subscribers. full: everything an API key can do",
      )
        .choices(["limited", "full"])
        .default("limited")
        .conflicts("scope"),
    )
    .addOption(
      new Option(
        "--scope <scope...>",
        "pick scopes instead of --access",
      ).choices(ALL_ENVIRONMENT_KEY_SCOPES),
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          name: string,
          opts: {
            environment?: string;
            access: "limited" | "full";
            scope?: CreateEnvironmentKeyDto["scopes"];
            json?: boolean;
          },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await createEnvironmentKey(
            environmentId,
            opts.scope
              ? { name, scopes: opts.scope }
              : { name, access: opts.access },
          );
          if (response.status === 404) {
            console.error("Environment not found.");
            process.exitCode = 1;
            return;
          }
          if (opts.json) {
            printResult(response.data, opts);
            return;
          }
          console.log(response.data.key);
          console.error(
            `Created ${response.data.name} with ${response.data.scopes.join(", ")}. Store it as a secret, e.g. SUBSCRIBER_API_KEY. It won't be shown again.`,
          );
        },
      ),
    );

  keys
    .command("list")
    .description("List API keys")
    .option(...ENVIRONMENT_OPTION)
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { environment?: string; json?: boolean }) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await listEnvironmentKeys(environmentId);
        if (response.status === 404) {
          console.error("Environment not found.");
          process.exitCode = 1;
          return;
        }
        printResult(response.data.keys, opts);
      }),
    );

  keys
    .command("revoke <keyId>")
    .description("Revoke an API key. Requests made with it fail straight away.")
    .option(...ENVIRONMENT_OPTION)
    .action(
      run(async (keyId: string, opts: { environment?: string }) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await revokeEnvironmentKey(environmentId, keyId);
        if (response.status === 404) {
          console.error("API key not found.");
          process.exitCode = 1;
          return;
        }
        console.log(`Revoked API key ${keyId}.`);
      }),
    );
}
