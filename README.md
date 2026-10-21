# subscriber.dev

The open source Customer.io alternative. Run lifecycle email from your terminal, your API or your AI agent.

- **Workflows** triggered by your app or by Stripe events, such as a trial starting or a payment failing, with delays and exit conditions.
- **Broadcasts** to any segment of your subscribers, spread over hours if you like.
- **Bring your own email provider.** Resend, Postmark, Amazon SES and Cloudflare Email are built in, with bounces and spam complaints handled for you. Anything else works over SMTP.
- **No dashboard.** Everything happens through the REST API, the CLI and TUI, or your AI agent over MCP. A web editor is there for tweaking the copy.

[Website](https://subscriber.dev) · [Docs](https://docs.subscriber.dev) · [Pricing](https://subscriber.dev/#pricing)

## Get started

Sign in with the CLI. A browser opens once to confirm.

```bash
npx @subscriber.dev/cli login
```

Or add the MCP server to your agent and ask it to set things up:

```bash
claude mcp add --transport http subscriber https://mcp.subscriber.dev
```

The [quickstart](https://docs.subscriber.dev/quickstart) takes you from sign-in to your first workflow email.

## Self-hosting

The community edition is free and has no limits. Emails end with a small "Powered by subscriber.dev" line. See the [self-hosting guide](https://docs.subscriber.dev/self-hosting).

## Development

You'll need Node.js 22.12 or later, pnpm, Postgres and Redis.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

| Path | What it is |
| --- | --- |
| `apps/api` | REST API, MCP server and background jobs (NestJS) |
| `apps/web` | Website, sign-in, unsubscribe pages and the email editor (Next.js) |
| `apps/cli` | The `subscriber` CLI and TUI |
| `apps/docs` | docs.subscriber.dev (Mintlify) |
| `packages/*` | Shared code: database, auth, email rendering and the API client |

See [CONTRIBUTING.md](CONTRIBUTING.md) to send a change.

## License

[AGPL-3.0](LICENSE).
