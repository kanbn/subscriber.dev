import { Liquid } from "liquidjs";

const engine = new Liquid();

export async function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): Promise<string> {
  return engine.parseAndRender(template, context);
}
