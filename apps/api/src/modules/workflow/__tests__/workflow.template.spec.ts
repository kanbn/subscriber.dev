import { describe, expect, it } from "vitest";

import { renderTemplate } from "../workflow.template.js";

describe("renderTemplate", () => {
  it("renders variables and filters", async () => {
    await expect(
      renderTemplate("Hi {{ name | upcase }}", { name: "ada" }),
    ).resolves.toBe("Hi ADA");
  });

  it("escapes values in html, unless they use the raw filter", async () => {
    const context = { name: '<a href="https://evil.example">x</a>' };
    await expect(
      renderTemplate("<p>{{ name }}</p>", context, { html: true }),
    ).resolves.toBe(
      "<p>&lt;a href=&#34;https://evil.example&#34;&gt;x&lt;/a&gt;</p>",
    );
    await expect(
      renderTemplate("{{ name | raw }}", context, { html: true }),
    ).resolves.toBe(context.name);
    await expect(renderTemplate("{{ name }}", context)).resolves.toBe(
      context.name,
    );
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
