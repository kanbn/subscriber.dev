import type { Command } from "commander";
import { Option } from "commander";

import {
  createWorkspace,
  getWorkspaces,
  updateWorkspace,
} from "@subscriber.dev/api-client/cli";
import { updateCliConfig } from "@subscriber.dev/shared";

import { ensureLoggedIn } from "../auth.js";
import { requireWorkspaceId } from "../context.js";
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
    .command("create <name>")
    .description("Create a new workspace")
    .option("--json", "output as JSON")
    .action(
      run(async (name: string, opts: { json?: boolean }) => {
        ensureLoggedIn();
        const response = await createWorkspace({ name });
        printResult(response.data, opts);
      }),
    );

  workspaces
    .command("update")
    .description("Update the current workspace")
    .option(
      "--postal-address <address>",
      'postal address shown in every email footer. Use "" to remove it',
    )
    .addOption(
      new Option(
        "--powered-by <on|off>",
        'show "Powered by subscriber.dev" in email footers (paid plans can turn it off)',
      ).choices(["on", "off"]),
    )
    .option("--workspace <workspaceId>", "workspace to update")
    .option("--json", "output as JSON")
    .action(
      run(
        async (opts: {
          postalAddress?: string;
          poweredBy?: "on" | "off";
          workspace?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          if (opts.postalAddress === undefined && !opts.poweredBy) {
            console.error("Pass --postal-address or --powered-by.");
            process.exitCode = 1;
            return;
          }
          const response = await updateWorkspace(requireWorkspaceId(opts), {
            postalAddress: opts.postalAddress,
            poweredBy: opts.poweredBy ? opts.poweredBy === "on" : undefined,
          });
          if (response.status === 404) {
            console.error("Workspace not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
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
