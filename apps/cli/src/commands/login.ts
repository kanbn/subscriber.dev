import { spawn } from "child_process";
import { hostname } from "os";
import type { Command } from "commander";

import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

import { printResult } from "../output.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in through the browser, or with an existing API key")
    .option("--api-key <key>", "use an existing API key instead")
    .option("--base-url <url>", "API base URL", "https://api.subscriber.dev")
    .option("--app-url <url>", "web app URL", "https://subscriber.dev")
    .action(
      async (opts: { apiKey?: string; baseUrl: string; appUrl: string }) => {
        const apiKey = opts.apiKey ?? (await deviceLogin(opts.appUrl));
        updateCliConfig({ apiKey, apiBaseUrl: opts.baseUrl });
        console.log(`Logged in. API base URL set to ${opts.baseUrl}`);
      },
    );

  program
    .command("logout")
    .description("Clear the stored API key")
    .action(() => {
      updateCliConfig({ apiKey: undefined });
      console.log("Logged out.");
    });

  program
    .command("whoami")
    .description("Show the current CLI configuration")
    .option("--json", "output as JSON")
    .action((opts: { json?: boolean }) => {
      const config = readCliConfig();
      printResult(
        {
          loggedIn: Boolean(config.apiKey),
          apiBaseUrl: config.apiBaseUrl,
          currentWorkspaceId: config.currentWorkspaceId,
          currentEnvironmentId: config.currentEnvironmentId,
        },
        opts,
      );
    });
}

const CLIENT_ID = "subscriber-cli";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
}

async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: (await res.json()) as T };
}

function openBrowser(url: string): void {
  const [command, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  // Best effort: the URL is printed too, for SSH sessions and the like.
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => undefined)
    .unref();
}

// OAuth device flow (RFC 8628) against better-auth, then swap the session
// for a long-lived API key, which is what the CLI sends.
async function deviceLogin(appUrl: string): Promise<string> {
  const auth = `${appUrl.replace(/\/$/, "")}/api/auth`;
  const { ok, data: code } = await postJson<DeviceCodeResponse>(
    `${auth}/device/code`,
    { client_id: CLIENT_ID },
  );
  if (!ok) throw new Error(`Couldn't start sign-in at ${appUrl}.`);

  const userCode = code.user_code.replace(/^(.{4})(.{4})$/, "$1-$2");
  console.log(`Your code: ${userCode}`);
  console.log(`Opening ${code.verification_uri_complete}`);
  console.log(
    `If it doesn't open, visit ${code.verification_uri} and enter the code.`,
  );
  openBrowser(code.verification_uri_complete);

  let interval = code.interval * 1000;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const { ok, data } = await postJson<{
      access_token?: string;
      error?: string;
    }>(`${auth}/device/token`, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: code.device_code,
      client_id: CLIENT_ID,
    });
    if (ok && data.access_token) {
      const { ok: created, data: key } = await postJson<{ key?: string }>(
        `${auth}/api-key/create`,
        { name: `cli · ${hostname()}` },
        { authorization: `Bearer ${data.access_token}` },
      );
      if (!created || !key.key) throw new Error("Couldn't create an API key.");
      return key.key;
    }
    if (data.error === "slow_down") interval += 5000;
    else if (data.error === "access_denied") throw new Error("Sign-in denied.");
    else if (data.error === "expired_token")
      throw new Error("The code expired. Run `subscriber login` again.");
    else if (data.error !== "authorization_pending")
      throw new Error(`Sign-in failed: ${data.error ?? "unknown error"}`);
  }
}
