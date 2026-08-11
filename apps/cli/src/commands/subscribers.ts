import type { Command } from "commander";

import type {
  CreateSubscriberDto,
  UpdateSubscriberDto,
} from "@subscriber.dev/api-client/cli";
import {
  createSubscriber,
  deleteSubscriber,
  getSubscriber,
  listSubscribers,
  updateSubscriber,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

interface SubscriberFieldOpts {
  environment?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  json?: boolean;
}

function addFieldOptions(command: Command) {
  return command
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--email <email>", "email address")
    .option("--phone <phone>", "phone number")
    .option("--external-id <externalId>", "your own identifier")
    .option("--first-name <firstName>", "first name")
    .option("--last-name <lastName>", "last name")
    .option("--name <name>", "full name")
    .option("--json", "output as JSON");
}

export function registerSubscribersCommand(program: Command): void {
  const subscribers = program
    .command("subscribers")
    .description("Manage subscribers");

  subscribers
    .command("list")
    .description("List subscribers in an environment")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--email <email>", "filter by exact email")
    .option("--external-id <externalId>", "filter by exact external ID")
    .option("--opted-in", "filter to subscribers opted into email")
    .option("--opted-out", "filter to subscribers opted out of email")
    .option("--limit <limit>", "max results (1-100)")
    .option("--offset <offset>", "pagination offset")
    .option("--json", "output as JSON")
    .action(
      run(
        async (opts: {
          environment?: string;
          email?: string;
          externalId?: string;
          optedIn?: boolean;
          optedOut?: boolean;
          limit?: string;
          offset?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const emailOptedIn = opts.optedIn
            ? true
            : opts.optedOut
              ? false
              : undefined;

          const response = await listSubscribers(environmentId, {
            email: opts.email,
            externalId: opts.externalId,
            emailOptedIn,
            limit: opts.limit ? Number(opts.limit) : undefined,
            offset: opts.offset ? Number(opts.offset) : undefined,
          });
          if (response.status === 404) {
            console.error("Environment not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data.subscribers, opts);
        },
      ),
    );

  subscribers
    .command("get <subscriberId>")
    .description("Get a subscriber")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          subscriberId: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await getSubscriber(environmentId, subscriberId);
          if (response.status === 404) {
            console.error("Subscriber not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  addFieldOptions(subscribers.command("create"))
    .description("Create a subscriber")
    .action(
      run(async (opts: SubscriberFieldOpts) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await createSubscriber(environmentId, {
          email: opts.email,
          phone: opts.phone,
          externalId: opts.externalId,
          firstName: opts.firstName,
          lastName: opts.lastName,
          name: opts.name,
        } as CreateSubscriberDto);
        if (response.status !== 201) {
          console.error("Failed to create subscriber.");
          process.exitCode = 1;
          return;
        }
        printResult(response.data, opts);
      }),
    );

  addFieldOptions(subscribers.command("update <subscriberId>"))
    .description("Update a subscriber (only passed fields are changed)")
    .action(
      run(async (subscriberId: string, opts: SubscriberFieldOpts) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);

        const patch: Partial<UpdateSubscriberDto> = {};
        if (opts.email !== undefined) patch.email = opts.email;
        if (opts.phone !== undefined) patch.phone = opts.phone;
        if (opts.externalId !== undefined) patch.externalId = opts.externalId;
        if (opts.firstName !== undefined) patch.firstName = opts.firstName;
        if (opts.lastName !== undefined) patch.lastName = opts.lastName;
        if (opts.name !== undefined) patch.name = opts.name;

        if (Object.keys(patch).length === 0) {
          console.error(
            "No fields to update. Pass at least one of --email, --phone, --external-id, --first-name, --last-name, --name.",
          );
          process.exitCode = 1;
          return;
        }

        const response = await updateSubscriber(
          environmentId,
          subscriberId,
          patch as UpdateSubscriberDto,
        );
        if (response.status === 404) {
          console.error("Subscriber not found.");
          process.exitCode = 1;
          return;
        }
        printResult(response.data, opts);
      }),
    );

  subscribers
    .command("delete <subscriberId>")
    .description("Delete a subscriber")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .action(
      run(async (subscriberId: string, opts: { environment?: string }) => {
        ensureLoggedIn();
        const environmentId = requireEnvironmentId(opts);
        const response = await deleteSubscriber(environmentId, subscriberId);
        if (response.status === 404) {
          console.error("Subscriber not found.");
          process.exitCode = 1;
          return;
        }
        console.log(`Deleted subscriber ${subscriberId}.`);
      }),
    );
}
