# @subscriber.dev/cli

The [subscriber.dev](https://subscriber.dev) CLI and TUI. Lifecycle email, triggered by your app or Stripe and sent through your own email provider.

```bash
npm install -g @subscriber.dev/cli
subscriber login
subscriber
```

`subscriber` with no arguments opens the TUI, which walks you through setup. Add `--help` to any command to see its options, or `--json` for scripts and agents.

Needs Node.js 22.12 or later. Self-hosting? Pass `--base-url` and `--app-url` to `subscriber login`.

Docs: [docs.subscriber.dev/cli](https://docs.subscriber.dev/cli)
