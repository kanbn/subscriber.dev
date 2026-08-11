import type { Command } from "commander";

import type { UpdateUserDto } from "@subscriber.dev/api-client/cli";
import {
  getCurrentUser,
  updateCurrentUser,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

export function registerUsersCommand(program: Command): void {
  const users = program.command("users").description("Manage your account");

  users
    .command("get")
    .description("Show the current user")
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { json?: boolean }) => {
        ensureLoggedIn();
        const response = await getCurrentUser();
        printResult(response.data, opts);
      }),
    );

  users
    .command("update")
    .description("Update the current user (only passed fields are changed)")
    .option("--name <name>", "display name")
    .option("--image <url>", "avatar image URL")
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { name?: string; image?: string; json?: boolean }) => {
        ensureLoggedIn();

        const patch: Partial<UpdateUserDto> = {};
        if (opts.name !== undefined) patch.name = opts.name;
        if (opts.image !== undefined) patch.image = opts.image;

        if (Object.keys(patch).length === 0) {
          console.error(
            "No fields to update. Pass at least one of --name, --image.",
          );
          process.exitCode = 1;
          return;
        }

        const response = await updateCurrentUser(patch as UpdateUserDto);
        printResult(response.data, opts);
      }),
    );
}
