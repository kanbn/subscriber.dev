import type { ErrorResponse } from "./generated/types.gen.js";
import { createClient, createConfig } from "./generated/client/index.js";
import { Api } from "./generated/sdk.gen.js";

export type * from "./generated/types.gen.js";

export interface SubscriberOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class SubscriberError extends Error {
  readonly status: number;
  readonly errors: ErrorResponse["errors"];

  constructor(status: number, body: unknown) {
    const error = (body ?? {}) as Partial<ErrorResponse>;
    super(error.message ?? `Request failed with status ${status}`);
    this.name = "SubscriberError";
    this.status = status;
    this.errors = error.errors;
  }
}

export class Subscriber extends Api {
  constructor(
    apiKey: string | undefined = typeof process === "undefined"
      ? undefined
      : process.env.SUBSCRIBER_API_KEY,
    options: SubscriberOptions = {},
  ) {
    if (!apiKey) {
      throw new Error(
        "Pass an API key to new Subscriber(), or set SUBSCRIBER_API_KEY. Create one with `subscriber keys create <name>`.",
      );
    }
    const client = createClient(
      createConfig({
        baseUrl: options.baseUrl ?? "https://api.subscriber.dev",
        fetch: options.fetch,
        auth: apiKey,
        throwOnError: true,
      }),
    );
    client.interceptors.error.use(
      (error, response) => new SubscriberError(response?.status ?? 0, error),
    );
    super({ client });
  }
}
