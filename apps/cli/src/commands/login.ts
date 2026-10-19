import { spawn } from "child_process";
import type { Command } from "commander";

import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

import { logout } from "../auth.js";
import { printResult } from "../output.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in through the browser")
    .option("--base-url <url>", "API base URL", "https://api.subscriber.dev")
    .option("--app-url <url>", "web app URL", "https://subscriber.dev")
    .action(
      async (opts: { baseUrl: string; appUrl: string }) => {
        const token = await deviceLogin(opts.appUrl);
        updateCliConfig({ token, apiBaseUrl: opts.baseUrl });
        console.log(`Logged in. API base URL set to ${opts.baseUrl}`);
      },
    );

  program
    .command("logout")
    .description("Sign out and clear the stored session")
    .action(async () => {
      const { revoked } = await logout();
      console.log(
        revoked
          ? "Logged out."
          : "Logged out here, but couldn't reach the API to sign out, so the session still works until it expires.",
      );
    });

  program
    .command("whoami")
    .description("Show the current CLI configuration")
    .option("--json", "output as JSON")
    .action((opts: { json?: boolean }) => {
      const config = readCliConfig();
      printResult(
        {
          loggedIn: Boolean(config.token),
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
): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: (await res.json()) as T };
}

export function openBrowser(url: string): void {
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

// OAuth device flow (RFC 8628) against better-auth. The access token is a
// session token, which the CLI sends as a bearer.
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
    if (ok && data.access_token) return data.access_token;
    if (data.error === "slow_down") interval += 5000;
    else if (data.error === "access_denied") throw new Error("Sign-in denied.");
    else if (data.error === "expired_token")
      throw new Error("The code expired. Run `subscriber login` again.");
    else if (data.error !== "authorization_pending")
      throw new Error(`Sign-in failed: ${data.error ?? "unknown error"}`);
  }
}
