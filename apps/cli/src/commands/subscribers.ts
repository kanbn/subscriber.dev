import type { Command } from "commander";

import type {
  BulkUpsertSubscribersDto,
  CreateSubscriberDto,
  UpdateSubscriberDto,
} from "@subscriber.dev/api-client/cli";
import {
  addSubscriberTag,
  bulkUpsertSubscribers,
  createSubscriber,
  deleteSubscriber,
  getSubscriber,
  listSubscribers,
  removeSubscriberTag,
  updateSubscriber,
  updateSubscriberPreferences,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { readJsonFile } from "../json-input.js";
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
  attributes?: string;
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
    .option(
      "--attributes <json>",
      'custom attributes as a JSON object, e.g. \'{"plan":"pro"}\' (replaces all existing attributes on update)',
    )
    .option("--json", "output as JSON");
}

function parseAttributes(
  value: string | undefined,
): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = undefined;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
    return parsed as Record<string, unknown>;
  console.error("--attributes must be a JSON object.");
  process.exitCode = 1;
  return null;
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
    .option(
      "--search <text>",
      "case-insensitive partial match across email, phone, external ID, first name, last name, and name",
    )
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
          search?: string;
          optedIn?: boolean;
          optedOut?: boolean;
          limit?: string;
          offset?: string;
          json?: boolean;
        }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const emailOptedIn = opts.optedIn
            ? "true"
            : opts.optedOut
              ? "false"
              : undefined;

          const response = await listSubscribers(environmentId, {
            email: opts.email,
            externalId: opts.externalId,
            q: opts.search,
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
        const attributes = parseAttributes(opts.attributes);
        if (attributes === null) return;
        const response = await createSubscriber(environmentId, {
          email: opts.email,
          phone: opts.phone,
          externalId: opts.externalId,
          firstName: opts.firstName,
          lastName: opts.lastName,
          name: opts.name,
          attributes,
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
        const attributes = parseAttributes(opts.attributes);
        if (attributes === null) return;
        if (attributes !== undefined) patch.attributes = attributes;

        if (Object.keys(patch).length === 0) {
          console.error(
            "No fields to update. Pass at least one of --email, --phone, --external-id, --first-name, --last-name, --name, --attributes.",
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
    .command("update-preferences <subscriberId>")
    .description("Set a subscriber's email opt-in preference")
    .option("--opted-in", "opt the subscriber into email")
    .option("--opted-out", "opt the subscriber out of email")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          subscriberId: string,
          opts: {
            optedIn?: boolean;
            optedOut?: boolean;
            environment?: string;
            json?: boolean;
          },
        ) => {
          ensureLoggedIn();

          if (opts.optedIn === opts.optedOut) {
            console.error("Pass exactly one of --opted-in or --opted-out.");
            process.exitCode = 1;
            return;
          }

          const environmentId = requireEnvironmentId(opts);
          const response = await updateSubscriberPreferences(
            environmentId,
            subscriberId,
            { email: opts.optedIn === true },
          );
          if (response.status === 404) {
            console.error("Subscriber not found.");
            process.exitCode = 1;
            return;
          }
          printResult(response.data, opts);
        },
      ),
    );

  subscribers
    .command("bulk")
    .description("Bulk create or update up to 500 subscribers from a JSON file")
    .requiredOption(
      "--file <path>",
      'path to a JSON file containing {"subscribers": [...]} or a bare array (use "-" for stdin)',
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

          const subscribersInput = Array.isArray(result.data)
            ? result.data
            : (result.data as { subscribers?: unknown }).subscribers;

          if (!Array.isArray(subscribersInput)) {
            console.error(
              'JSON must be an array, or an object with a "subscribers" array.',
            );
            process.exitCode = 1;
            return;
          }

          const response = await bulkUpsertSubscribers(environmentId, {
            subscribers:
              subscribersInput as BulkUpsertSubscribersDto["subscribers"],
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

  subscribers
    .command("tag <subscriberId>")
    .description("Add or remove a tag on a subscriber")
    .option("--add <tag>", "tag to add")
    .option("--remove <tag>", "tag to remove")
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          subscriberId: string,
          opts: {
            add?: string;
            remove?: string;
            environment?: string;
            json?: boolean;
          },
        ) => {
          ensureLoggedIn();

          const tagToAdd = opts.add;
          const tagToRemove = opts.remove;

          if ((tagToAdd && tagToRemove) || (!tagToAdd && !tagToRemove)) {
            console.error("Pass exactly one of --add or --remove.");
            process.exitCode = 1;
            return;
          }

          const environmentId = requireEnvironmentId(opts);

          if (tagToAdd) {
            const response = await addSubscriberTag(
              environmentId,
              subscriberId,
              { tag: tagToAdd },
            );
            if (response.status === 404) {
              console.error("Subscriber not found.");
              process.exitCode = 1;
              return;
            }
            printResult(response.data, opts);
            return;
          }
          if (!tagToRemove) return;

          const response = await removeSubscriberTag(
            environmentId,
            subscriberId,
            tagToRemove,
          );
          if (response.status === 404) {
            console.error("Subscriber not found.");
            process.exitCode = 1;
            return;
          }
          console.log(`Removed tag "${opts.remove}" from ${subscriberId}.`);
        },
      ),
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
