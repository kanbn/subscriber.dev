import type { Command } from "commander";

import type { UpsertIntegrationDto } from "@subscriber.dev/api-client/cli";
import {
  deleteIntegration,
  getIntegration,
  listInboundEvents,
  listIntegrations,
  setPrimaryIntegration,
  upsertIntegration,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

export function registerIntegrationsCommand(program: Command): void {
  const integrations = program
    .command("integrations")
    .description(
      "Manage environment integrations (e.g. smtp). Multiple email integrations failover in priority order on send.",
    );

  integrations
    .command("list")
    .description("List configured integrations in an environment")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { environment?: string; json?: boolean }) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await listIntegrations(environmentId);
        if (response.status === 404) {
          console.error("Environment not found.");
          process.exitCode = 1;
          return;
        }
        printResult(response.data.integrations, opts);
      }),
    );

  integrations
    .command("events")
    .description(
      "List events received from connected integrations (e.g. Stripe webhooks) and what happened to each",
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--source <source>", 'only events from this source, e.g. "stripe"')
    .option("--limit <limit>", "max results (1-100)")
    .option("--offset <offset>", "pagination offset")
    .option("--json", "output as JSON")
    .action(
      run(
        async (opts: {
          environment?: string;
          source?: string;
          limit?: string;
          offset?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await listInboundEvents(environmentId, {
            source: opts.source,
            limit: opts.limit ? Number(opts.limit) : undefined,
            offset: opts.offset ? Number(opts.offset) : undefined,
          });
          printResult(response.data.events, opts);
        },
      ),
    );

  integrations
    .command("get <type>")
    .description('Get a single integration (e.g. "smtp")')
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          type: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await getIntegration(environmentId, type);
          if (response.status === 404) {
            console.error("Environment or integration not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  integrations
    .command("set <type>")
    .description(
      "Configure an integration. Body shape depends on the integration type.",
    )
    .requiredOption(
      "--body <json>",
      "JSON object of config/secret fields for this integration type",
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          type: string,
          opts: { body: string; environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);

          let body: Record<string, unknown>;
          try {
            body = JSON.parse(opts.body) as Record<string, unknown>;
          } catch {
            console.error("--body must be valid JSON.");
            process.exitCode = 1;
            return;
          }

          // The generated UpsertIntegrationDto type is `{ root: {...} }`, an
          // artifact of how nestjs-zod documents an open-dictionary body in
          // OpenAPI. The real request body is the flat object itself, which
          // is what actually gets sent (cliFetch just JSON.stringifies it).
          const response = await upsertIntegration(
            environmentId,
            type,
            body as unknown as UpsertIntegrationDto,
          );
          if (response.status === 400) {
            console.error("Invalid config or failed verification.");
            process.exitCode = 1;
            return;
          }
          if (response.status === 404) {
            console.error("Environment or integration type not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  integrations
    .command("set-primary <type>")
    .description(
      "Move an integration to the front of the failover order (tried first on send)",
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          type: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await setPrimaryIntegration(environmentId, type);
          if (response.status === 404) {
            console.error("Environment or integration not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  integrations
    .command("remove <type>")
    .description("Remove an integration")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .action(
      run(async (type: string, opts: { environment?: string }) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await deleteIntegration(environmentId, type);
        if (response.status === 404) {
          console.error("Environment or integration not found.");
          process.exitCode = 1;
          return;
        }
        console.log(`Removed integration "${type}".`);
      }),
    );
}
