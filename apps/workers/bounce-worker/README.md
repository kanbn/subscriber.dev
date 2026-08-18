# @subscriber.dev/bounce-worker

A Cloudflare Email Worker that receives bounced-email return-path messages and reports them to the subscriber.dev API.

## How it fits together

When the API sends an email through the `smtp` integration, it sets the envelope return-path (VERP) to `bounce+<runStepPublicId>@<your bounce domain>` (see `BOUNCE_DOMAIN` in the API's environment). If that email later bounces, the receiving mail server sends a delivery-failure notice back to that address.

This worker:

1. Receives that notice via Cloudflare Email Routing.
2. Extracts the run step's `publicId` from the recipient address.
3. Parses the message to decide whether it's actually a bounce, and classifies it `hard` or `soft` using SMTP status codes and common phrasing (best-effort - not all bounces are strictly RFC 3464-structured).
4. `POST`s `{ runStepPublicId, bounceType, reason }` to the API's `POST /bounces/inbound` endpoint, authenticated with a shared bearer secret.

## One-time Cloudflare setup (manual - not automatable from this repo)

1. **Enable Email Routing** for your domain in the Cloudflare dashboard (Email → Email Routing). This adds the required MX/TXT records.
2. **Deploy this worker**: `pnpm --filter @subscriber.dev/bounce-worker deploy` (requires `wrangler login` first).
3. **Set the shared secret**: `wrangler secret put BOUNCE_WEBHOOK_SECRET` (paste the same value as the API's `BOUNCE_WEBHOOK_SECRET` env var).
4. **Confirm `BOUNCE_WEBHOOK_URL`** in `wrangler.toml` points at your API's base URL.
5. **Route the bounce address to this worker**: Email → Email Routing → Routing rules → add a rule sending `bounce@<your bounce domain>` (or a catch-all under that subdomain, since the local part varies per run step - `bounce+<runStepPublicId>@...`) to this worker.
6. **Set `BOUNCE_DOMAIN`** on the API to that same domain, so outbound sends use the matching return-path.

## Local development

```sh
cp .dev.vars.example .dev.vars   # fill in BOUNCE_WEBHOOK_SECRET
pnpm --filter @subscriber.dev/bounce-worker dev
```

`wrangler dev` doesn't receive real inbound email locally; use `pnpm test` to exercise the parsing/classification logic, or POST directly to a locally-running API's `/bounces/inbound` to test that side.

## Testing

`bounceDetection.ts` and `postBounceEvent.ts` are plain functions with no Workers-runtime dependency, so they're covered by ordinary vitest unit tests (`pnpm test`). The `email()` handler itself (`src/index.ts`) is intentionally thin - it wires those functions together against the real `ForwardableEmailMessage`/`postal-mime` APIs, which is exercised by an actual bounce arriving in production rather than by a local test.
