import { render } from "ink";

import { App } from "./App.js";

export function runTui(version: string): void {
  render(<App version={version} />, { alternateScreen: true });
}
