import type { LiquidOptions } from "liquidjs";
import { Liquid } from "liquidjs";

const options: LiquidOptions = {
  templates: {},
  parseLimit: 1_000_000,
  renderLimit: 1_000,
  memoryLimit: 10_000_000,
};
const engine = new Liquid(options);
const htmlEngine = new Liquid({ ...options, outputEscape: "escape" });

export async function renderTemplate(
  template: string,
  context: Record<string, unknown>,
  { html = false } = {},
): Promise<string> {
  return (html ? htmlEngine : engine).parseAndRender(
    template,
    context,
  ) as Promise<string>;
}
