#!/usr/bin/env node
import { Command } from "commander";

import { registerEnvironmentsCommand } from "./commands/environments.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerWorkspacesCommand } from "./commands/workspaces.js";

const program = new Command();

program.name("subscriber").description("subscriber.dev CLI").version("0.1.0");

registerLoginCommand(program);
registerWorkspacesCommand(program);
registerEnvironmentsCommand(program);

program.parse();
