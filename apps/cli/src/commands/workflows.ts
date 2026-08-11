import type { Command } from "commander";

import {
  getWorkflow,
  listWorkflows,
  triggerWorkflow,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

export function registerWorkflowsCommand(program: Command): void {
  const workflows = program
    .command("workflows")
    .description("Manage workflows");

  workflows
    .command("list")
    .description("List workflows in an environment")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--limit <limit>", "max results (1-100)")
    .option("--offset <offset>", "pagination offset")
    .option("--json", "output as JSON")
    .action(
      run(
        async (opts: {
          environment?: string;
          limit?: string;
          offset?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await listWorkflows(environmentId, {
            limit: opts.limit ? Number(opts.limit) : undefined,
            offset: opts.offset ? Number(opts.offset) : undefined,
          });
          if (response.status === 404) {
            console.error("Environment not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data.workflows, opts);
        },
      ),
    );

  workflows
    .command("get <workflowId>")
    .description("Get a workflow, including its steps")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          workflowId: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await getWorkflow(environmentId, workflowId);
          if (response.status === 404) {
            console.error("Workflow not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  workflows
    .command("trigger <key>")
    .description("Trigger a workflow run for a subscriber")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--subscriber-id <publicId>", "subscriber public ID")
    .option("--external-id <externalId>", "subscriber external ID")
    .option("--email <email>", "subscriber email")
    .option(
      "--payload <json>",
      "JSON object merged into template variables",
      "{}",
    )
    .action(
      run(
        async (
          key: string,
          opts: {
            environment?: string;
            subscriberId?: string;
            externalId?: string;
            email?: string;
            payload: string;
            json?: boolean;
          },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);

          if (!opts.subscriberId && !opts.externalId && !opts.email) {
            console.error(
              "No subscriber specified. Pass one of --subscriber-id, --external-id, or --email.",
            );
            process.exitCode = 1;
            return;
          }

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(opts.payload) as Record<string, unknown>;
          } catch {
            console.error("--payload must be valid JSON.");
            process.exitCode = 1;
            return;
          }

          const response = await triggerWorkflow(environmentId, {
            key,
            subscriber: {
              publicId: opts.subscriberId,
              externalId: opts.externalId,
              email: opts.email,
            },
            payload,
          });
          if (response.status === 404) {
            console.error("Workflow or subscriber not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );
}
