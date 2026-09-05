import type { Command } from "commander";

import { getAnalytics } from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

export function registerAnalyticsCommand(program: Command): void {
  program
    .command("analytics")
    .description("Show basic analytics for an environment")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option(
      "--days <days>",
      "lookback window in days for new/opted-out subscriber counts (default 30)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (opts: {
          environment?: string;
          days?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await getAnalytics(environmentId, {
            days: opts.days ? Number(opts.days) : undefined,
          });
          if (response.status === 404) {
            console.error("Environment not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );
}
