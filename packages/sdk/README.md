# @subscriber.dev/sdk

The TypeScript SDK for [subscriber.dev](https://subscriber.dev): add subscribers and trigger workflows from your app.

```bash
npm install @subscriber.dev/sdk
```

## Get an API key

```bash
subscriber keys create "Acme app"
```

The key belongs to one environment, so requests never name it. It's only shown once: store it as `SUBSCRIBER_API_KEY` and keep it on your server.

A key is `limited` by default: it can create and update subscribers and trigger workflows. Pass `--access full` for everything else. See [Authentication](https://docs.subscriber.dev/api-reference/introduction#authentication).

## Use it

```ts
import { Subscriber } from "@subscriber.dev/sdk";

const client = new Subscriber(process.env.SUBSCRIBER_API_KEY);

await client.workflows.trigger({
  key: "welcome",
  subscriber: { email: "jane@acme.com", firstName: "Jane" },
  payload: { plan: "pro" },
});
```

`new Subscriber()` with no arguments reads `SUBSCRIBER_API_KEY`. Each call returns `{ data, response }`.

## Errors

Failed requests throw a `SubscriberError` with the API's message and status:

```ts
import { SubscriberError } from "@subscriber.dev/sdk";

try {
  await client.workflows.trigger({ key: "welcome", subscriber: { email } });
} catch (error) {
  if (error instanceof SubscriberError && error.status === 404) {
    console.warn(error.message);
  }
}
```

`error.errors` lists the invalid fields on a `400`.

## Options

```ts
new Subscriber(apiKey, {
  baseUrl: "https://api.yourdomain.com",
  fetch: customFetch,
});
```

Use `baseUrl` if you [self-host](https://docs.subscriber.dev/self-hosting).

## License

MIT
