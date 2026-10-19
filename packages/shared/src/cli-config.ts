import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export interface CliConfig {
  token?: string;
  apiBaseUrl?: string;
  currentWorkspaceId?: string;
  currentEnvironmentId?: string;
}

const CONFIG_PATH = join(homedir(), ".config", "subscriber", "config.json");

export function readCliConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as CliConfig;
}

export function writeCliConfig(config: CliConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function updateCliConfig(patch: Partial<CliConfig>): CliConfig {
  const next = { ...readCliConfig(), ...patch };
  writeCliConfig(next);
  return next;
}
