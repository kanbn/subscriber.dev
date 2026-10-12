import type { Command } from "commander";

import { disconnectAgent, listAgents } from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

export function registerAgentsCommand(program: Command): void {
  const agents = program
    .command("agents")
    .description("Manage AI agents connected through MCP sign-in");

  agents
    .command("list")
    .description("List connected agents")
    .option("--json", "output as JSON")
    .action(
      run(async (opts: { json?: boolean }) => {
        ensureLoggedIn();
        const response = await listAgents();
        printResult(response.data, opts);
      }),
    );

  agents
    .command("disconnect <clientId>")
    .description("Disconnect an agent and revoke its access")
    .action(
      run(async (clientId: string) => {
        ensureLoggedIn();
        const response = await disconnectAgent(clientId);
        if (response.status === 404) {
          console.error("Agent not found.");
          process.exitCode = 1;
          return;
        }
        console.log(`Disconnected agent ${clientId}.`);
      }),
    );
}
