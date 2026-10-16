import type { Command } from "commander";

import type {
  CreateWorkflowDto,
  TriggerBroadcastDto,
  UpdateWorkflowDto,
} from "@subscriber.dev/api-client/cli";
import {
  cancelBroadcast,
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listBroadcasts,
  listEnvironmentRuns,
  listWorkflowRuns,
  listWorkflows,
  pauseBroadcast,
  redispatchBroadcast,
  resumeBroadcast,
  sendTestEmail,
  triggerBroadcast,
  triggerWorkflow,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { readJsonFile } from "../json-input.js";
import { printResult } from "../output.js";
import { run } from "../run.js";
import { openBrowser } from "./login.js";

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
    .option(
      "--type <type>",
      'filter by workflow type: "automation" or "broadcast"',
    )
    .option("--limit <limit>", "max results (1-100)")
    .option("--offset <offset>", "pagination offset")
    .option("--json", "output as JSON")
    .action(
      run(
        async (opts: {
          environment?: string;
          type?: "automation" | "broadcast";
          limit?: string;
          offset?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await listWorkflows(environmentId, {
            type: opts.type,
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
    .command("edit <workflowId>")
    .description("Open a workflow's emails in the web editor")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .action(
      run(async (workflowId: string, opts: { environment?: string }) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await getWorkflow(environmentId, workflowId);
        if (response.status !== 200 || !response.data.editUrl) {
          console.error("Workflow not found.");
          process.exitCode = 1;
          return;
        }
        console.log(`Opening ${response.data.editUrl}`);
        openBrowser(response.data.editUrl);
      }),
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
    .command("test <workflowId>")
    .description(
      "Send yourself one of a workflow's emails, without creating a subscriber or a run",
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option(
      "--step <number>",
      "which step to send, counting from 1 (defaults to the first email step)",
    )
    .option("--to <email>", "send it to someone else instead of you")
    .option(
      "--data <json>",
      'sample data for the template, e.g. \'{"plan": "pro", "subscriber": {"firstName": "Ada"}}\'',
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          workflowId: string,
          opts: {
            environment?: string;
            step?: string;
            to?: string;
            data?: string;
            json?: boolean;
          },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);

          let data: Record<string, unknown> | undefined;
          if (opts.data) {
            try {
              data = JSON.parse(opts.data) as Record<string, unknown>;
            } catch {
              console.error("--data must be valid JSON.");
              process.exitCode = 1;
              return;
            }
          }
          const step = opts.step === undefined ? undefined : Number(opts.step);
          if (step !== undefined && !(Number.isInteger(step) && step >= 1)) {
            console.error("--step must be a whole number, starting from 1.");
            process.exitCode = 1;
            return;
          }

          const response = await sendTestEmail(environmentId, {
            workflowId,
            step,
            to: opts.to,
            data,
          });
          if (response.status !== 200) {
            const message = (response.data as { message?: unknown } | undefined)
              ?.message;
            console.error(
              typeof message === "string"
                ? message
                : "The test email didn't send.",
            );
            process.exitCode = 1;
            return;
          }
          if (opts.json) {
            printResult(response.data, opts);
            return;
          }
          console.log(
            `Sent "${response.data.subject}" to ${response.data.to}.`,
          );
        },
      ),
    );

  workflows
    .command("create")
    .description(
      'Create a workflow from a JSON file: {"key", "name", "description"?, "type"?: "automation"|"broadcast", "steps": [...]}',
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

  workflows
    .command("broadcast <workflowId>")
    .description(
      'Trigger a broadcast: fan this workflow out to every subscriber matching an audience filter, e.g. {"type":"optedIn"}',
    )
    .requiredOption(
      "--audience <path>",
      'path to a JSON file with the audience filter (use "-" for stdin)',
    )
    .option(
      "--send-over-hours <hours>",
      "spread sends evenly over this many hours (max 168) instead of sending immediately",
    )
    .option(
      "--allow-over-plan",
      "subscriber.dev cloud: send even if it reaches more subscribers than your plan includes (moves you up a plan after 3 days)",
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
          opts: {
            audience: string;
            sendOverHours?: string;
            allowOverPlan?: boolean;
            environment?: string;
            json?: boolean;
          },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);

          const sendOverHours =
            opts.sendOverHours === undefined
              ? undefined
              : Number(opts.sendOverHours);
          if (
            sendOverHours !== undefined &&
            !(sendOverHours > 0 && sendOverHours <= 168)
          ) {
            console.error("--send-over-hours must be between 0 and 168.");
            process.exitCode = 1;
            return;
          }

          const result = readJsonFile(opts.audience);
          if (!result.ok) {
            console.error(result.message);
            process.exitCode = 1;
            return;
          }

          const response = await triggerBroadcast(environmentId, workflowId, {
            audience: result.data,
            sendOverHours,
            allowOverPlan: opts.allowOverPlan,
          } as TriggerBroadcastDto);
          if (response.status === 400) {
            console.error("Workflow is paused or has no steps.");
            process.exitCode = 1;
            return;
          }
          if (response.status === 404) {
            console.error("Workflow not found.");
            process.exitCode = 1;
            return;
          }
          if ((response.status as number) === 409) {
            const message = (response.data as { message?: unknown }).message;
            console.error(
              typeof message === "string"
                ? message.replace("allowOverPlan: true", "--allow-over-plan")
                : "This broadcast is over your plan.",
            );
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  workflows
    .command("broadcasts <workflowId>")
    .description("List broadcasts triggered for a workflow")
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
          const response = await listBroadcasts(environmentId, workflowId, {
            limit: opts.limit ? Number(opts.limit) : undefined,
            offset: opts.offset ? Number(opts.offset) : undefined,
          });
          if (response.status === 404) {
            console.error("Workflow not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data.broadcasts, opts);
        },
      ),
    );

  workflows
    .command("broadcast-pause <workflowId> <broadcastId>")
    .description("Pause a broadcast: hold every send that hasn't gone out yet")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          workflowId: string,
          broadcastId: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await pauseBroadcast(
            environmentId,
            workflowId,
            broadcastId,
          );
          if (response.status === 404) {
            console.error("Workflow or broadcast not found.");
            process.exitCode = 1;
            return;
          }
          if (response.status === 409) {
            console.error(`Can't pause this broadcast in its current status.`);
            process.exitCode = 1;
            return;
          }
          if (opts.json) {
            printResult(response.data, opts);
          } else {
            console.log(`Paused broadcast ${broadcastId}.`);
          }
        },
      ),
    );

  workflows
    .command("broadcast-resume <workflowId> <broadcastId>")
    .description("Resume a paused broadcast")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          workflowId: string,
          broadcastId: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await resumeBroadcast(
            environmentId,
            workflowId,
            broadcastId,
          );
          if (response.status === 404) {
            console.error("Workflow or broadcast not found.");
            process.exitCode = 1;
            return;
          }
          if (response.status === 409) {
            console.error(`Can't resume this broadcast in its current status.`);
            process.exitCode = 1;
            return;
          }
          if (opts.json) {
            printResult(response.data, opts);
          } else {
            console.log(`Resumed broadcast ${broadcastId}.`);
          }
        },
      ),
    );

  workflows
    .command("broadcast-cancel <workflowId> <broadcastId>")
    .description(
      "Cancel a broadcast: stop every send that hasn't gone out yet (cannot be undone)",
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
          broadcastId: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await cancelBroadcast(
            environmentId,
            workflowId,
            broadcastId,
          );
          if (response.status === 404) {
            console.error("Workflow or broadcast not found.");
            process.exitCode = 1;
            return;
          }
          if (response.status === 409) {
            console.error(`Can't cancel this broadcast in its current status.`);
            process.exitCode = 1;
            return;
          }
          if (opts.json) {
            printResult(response.data, opts);
          } else {
            console.log(`Cancelled broadcast ${broadcastId}.`);
          }
        },
      ),
    );

  workflows
    .command("broadcast-redispatch <workflowId> <broadcastId>")
    .description(
      "Set up every matching subscriber who hasn't been set up yet (e.g. after setup failed), over a fresh send window; anyone already set up is skipped",
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
          broadcastId: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await redispatchBroadcast(
            environmentId,
            workflowId,
            broadcastId,
          );
          if (response.status === 404) {
            console.error("Workflow or broadcast not found.");
            process.exitCode = 1;
            return;
          }
          if (response.status === 409) {
            console.error(
              `Can't re-dispatch this broadcast in its current status.`,
            );
            process.exitCode = 1;
            return;
          }
          if (opts.json) {
            printResult(response.data, opts);
          } else {
            console.log(`Re-dispatched broadcast ${broadcastId}.`);
          }
        },
      ),
    );
}
