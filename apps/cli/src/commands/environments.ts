import type { Command } from "commander";

import { listEnvironments } from "@subscriber.dev/api-client/cli";
import { updateCliConfig } from "@subscriber.dev/shared";

import { ensureLoggedIn } from "../auth.js";
import { requireWorkspaceId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

export function registerEnvironmentsCommand(program: Command): void {
  const environments = program
    .command("environments")
    .description("Manage environments");

  environments
    .command("list")
    .description("List environments in a workspace")
    .option(
      "--workspace <workspaceId>",
      "workspace public ID (defaults to the current workspace)",
    )
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { workspace?: string; json?: boolean }) => {
        ensureLoggedIn();
        const workspaceId = requireWorkspaceId(opts);

        const response = await listEnvironments(workspaceId);
        if (response.status === 404) {
          console.error("Workspace not found.");
          process.exitCode = 1;
          return;
        }

        printResult(response.data.environments, opts);
      }),
    );

  environments
    .command("use <environmentId>")
    .description("Set the current environment used by other commands")
    .option(
      "--workspace <workspaceId>",
      "workspace public ID to remember alongside this environment",
    )
    .action((environmentId: string, opts: { workspace?: string }) => {
      updateCliConfig({
        currentEnvironmentId: environmentId,
        ...(opts.workspace ? { currentWorkspaceId: opts.workspace } : {}),
      });
      console.log(`Current environment set to ${environmentId}.`);
    });
}
