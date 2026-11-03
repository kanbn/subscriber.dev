<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.png">
  <img alt="subscriber.dev" src=".github/assets/banner-light.png">
</picture>

<div align="center">
  <h3 align="center">subscriber.dev</h3>
  <p>The open source Customer.io alternative. Run lifecycle email from your terminal, your API or your AI agent.</p>
</div>

<p align="center">
  <a href="https://subscriber.dev">Website</a>
  ·
  <a href="https://docs.subscriber.dev">Docs</a>
  ·
  <a href="https://subscriber.dev/#pricing">Pricing</a>
</p>

<div align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPLv3-purple"></a>
</div>

## Features

- **Workflows**: Triggered by your app or by Stripe events, with delays and exit conditions
- **Broadcasts**: Send to any segment, spread over hours if you like
- **Bring your own provider**: Resend, Postmark, Amazon SES, Cloudflare Email or any SMTP server
- **Agent-first**: The REST API, CLI and TUI, or your AI agent over MCP, plus a web editor for the copy

## Get Started

```bash
npx @subscriber.dev/cli login
```

Or add the MCP server to your agent:

```bash
claude mcp add --transport http subscriber https://mcp.subscriber.dev
```

## Made With

- [Next.js](https://nextjs.org/?ref=subscriber.dev)
- [NestJS](https://nestjs.com/?ref=subscriber.dev)
- [Better Auth](https://better-auth.com/?ref=subscriber.dev)
- [Drizzle ORM](https://orm.drizzle.team/?ref=subscriber.dev)
- [BullMQ](https://bullmq.io/?ref=subscriber.dev)
- [React Email](https://react.email/?ref=subscriber.dev)

## Self Hosting

The community edition is free and unlimited, under AGPLv3. Emails end with a small "Powered by subscriber.dev" line, and a [Business license](https://docs.subscriber.dev/self-hosting) removes it. Fill in `.env` from [.env.example](.env.example), then:

```bash
docker compose up -d
```

See the [self-hosting guide](https://docs.subscriber.dev/self-hosting) for the details.

## Local Development

You'll need Node.js 24, Postgres and Redis.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

## Contributing

Please read the [contribution guidelines](CONTRIBUTING.md) before opening a pull request.

## License

subscriber.dev is licensed under the [AGPLv3 license](LICENSE).

## Contact

Email [henry@subscriber.dev](mailto:henry@subscriber.dev).
