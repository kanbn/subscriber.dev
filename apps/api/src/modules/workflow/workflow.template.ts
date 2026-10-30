import { Liquid } from "liquidjs";

const engine = new Liquid({
  templates: {},
  parseLimit: 1_000_000,
  renderLimit: 1_000,
  memoryLimit: 10_000_000,
});

export async function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): Promise<string> {
  return engine.parseAndRender(template, context);
}
