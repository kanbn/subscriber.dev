#!/usr/bin/env node
import { Command } from "commander";

import { ensureLoggedIn } from "./auth.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerAnalyticsCommand } from "./commands/analytics.js";
import { registerBillingCommand } from "./commands/billing.js";
import { registerEnvironmentsCommand } from "./commands/environments.js";
import { registerIntegrationsCommand } from "./commands/integrations.js";
import { registerKeysCommand } from "./commands/keys.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerSubscribersCommand } from "./commands/subscribers.js";
import { registerUploadsCommand } from "./commands/uploads.js";
import { registerUsersCommand } from "./commands/users.js";
import { registerWorkflowsCommand } from "./commands/workflows.js";
import { registerWorkspacesCommand } from "./commands/workspaces.js";

if (process.argv.length <= 2) {
  ensureLoggedIn();
  const { runTui } = await import("./tui/index.js");
  runTui();
} else {
  const program = new Command();

  program.name("subscriber").description("subscriber.dev CLI").version("0.1.0");

  registerLoginCommand(program);
  registerWorkspacesCommand(program);
  registerEnvironmentsCommand(program);
  registerSubscribersCommand(program);
  registerWorkflowsCommand(program);
  registerUploadsCommand(program);
  registerUsersCommand(program);
  registerAgentsCommand(program);
  registerIntegrationsCommand(program);
  registerKeysCommand(program);
  registerAnalyticsCommand(program);
  registerBillingCommand(program);

  program.parse();
}
