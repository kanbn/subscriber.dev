import type { Command } from "commander";

import type {
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from "@subscriber.dev/api-client/cli";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listEnvironmentRuns,
  listWorkflowRuns,
  listWorkflows,
  triggerWorkflow,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { readJsonFile } from "../json-input.js";
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

  workflows
    .command("create")
    .description(
      'Create a workflow from a JSON file: {"key", "name", "description"?, "steps": [...]}',
    )
    .requiredOption(
      "--file <path>",
      'path to a JSON file with the workflow definition (use "-" for stdin)',
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (opts: {
          file: string;
          environment?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);

          const result = readJsonFile(opts.file);
          if (!result.ok) {
            console.error(result.message);
            process.exitCode = 1;
            return;
          }

          const response = await createWorkflow(
            environmentId,
            result.data as CreateWorkflowDto,
          );
          if (response.status === 404) {
            console.error("Environment not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  workflows
    .command("update <workflowId>")
    .description(
      "Update a workflow from a JSON file. Only passed fields are changed; " +
        "if steps is present, it replaces ALL existing steps.",
    )
    .requiredOption(
      "--file <path>",
      'path to a JSON file with the fields to change (use "-" for stdin)',
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          workflowId: string,
          opts: { file: string; environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);

          const result = readJsonFile(opts.file);
          if (!result.ok) {
            console.error(result.message);
            process.exitCode = 1;
            return;
          }

          const response = await updateWorkflow(
            environmentId,
            workflowId,
            result.data as UpdateWorkflowDto,
          );
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
    .command("delete <workflowId>")
    .description("Delete a workflow")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .action(
      run(async (workflowId: string, opts: { environment?: string }) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await deleteWorkflow(environmentId, workflowId);
        if (response.status === 404) {
          console.error("Workflow not found.");
          process.exitCode = 1;
          return;
        }
        console.log(`Deleted workflow ${workflowId}.`);
      }),
    );

  workflows
    .command("runs <workflowId>")
    .description("List runs for a workflow")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--limit <limit>", "max results (1-100)")
    .option("--offset <offset>", "pagination offset")
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          workflowId: string,
          opts: {
            environment?: string;
            limit?: string;
            offset?: string;
            json?: boolean;
          },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await listWorkflowRuns(environmentId, workflowId, {
            limit: opts.limit ? Number(opts.limit) : undefined,
            offset: opts.offset ? Number(opts.offset) : undefined,
          });
          if (response.status === 404) {
            console.error("Workflow not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data.runs, opts);
        },
      ),
    );

  workflows
    .command("run-history")
    .description("List triggered runs across every workflow in an environment")
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
          const response = await listEnvironmentRuns(environmentId, {
            limit: opts.limit ? Number(opts.limit) : undefined,
            offset: opts.offset ? Number(opts.offset) : undefined,
          });
          if (response.status === 404) {
            console.error("Environment not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data.runs, opts);
        },
      ),
    );
}
