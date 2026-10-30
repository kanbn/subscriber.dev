import { describe, expect, it } from "vitest";

import { renderTemplate } from "../workflow.template.js";

describe("renderTemplate", () => {
  it("renders variables and filters", async () => {
    await expect(
      renderTemplate("Hi {{ name | upcase }}", { name: "ada" }),
    ).resolves.toBe("Hi ADA");
  });

  it("can't read files from disk", async () => {
    for (const template of [
      "{% include 'package.json' %}",
      "{% render 'package.json' %}",
      "{% layout 'package.json' %}x",
    ]) {
      await expect(renderTemplate(template, {})).rejects.toThrow();
    }
  });

  it("stops runaway loops", async () => {
    await expect(
      renderTemplate("{% for i in (1..3000000) %}{{ i }}{% endfor %}", {}),
    ).rejects.toThrow();
  });
});
