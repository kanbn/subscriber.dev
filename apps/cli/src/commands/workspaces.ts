import type { Command } from "commander";

import { getWorkspaces } from "@subscriber.dev/api-client/cli";
import { updateCliConfig } from "@subscriber.dev/shared";

import { ensureLoggedIn } from "../auth.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

export function registerWorkspacesCommand(program: Command): void {
  const workspaces = program
    .command("workspaces")
    .description("Manage workspaces");

  workspaces
    .command("list")
    .description("List your workspaces")
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { json?: boolean }) => {
        ensureLoggedIn();
        const response = await getWorkspaces();
        printResult(response.data, opts);
      }),
    );

  workspaces
    .command("use <workspaceId>")
    .description("Set the current workspace used by other commands")
    .action((workspaceId: string) => {
      updateCliConfig({
        currentWorkspaceId: workspaceId,
        currentEnvironmentId: undefined,
      });
      console.log(`Current workspace set to ${workspaceId}.`);
    });
}
