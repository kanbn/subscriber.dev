import { readFileSync } from "fs";

const spec = JSON.parse(
  readFileSync(
    new URL("../../apps/docs/openapi.json", import.meta.url),
    "utf8",
  ),
);

for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    const apiKey = operation.security?.find((scheme) => "api-key" in scheme);
    if (!apiKey) {
      delete item[method];
      continue;
    }
    operation.security = [apiKey];
    const body = operation.requestBody?.content?.["application/json"];
    const ref = body?.schema?.$ref;
    if (ref) body.schema = spec.components.schemas[ref.split("/").pop()];
  }
  if (Object.keys(item).length === 0) delete spec.paths[path];
}

const pascal = (tag) =>
  tag
    .split(" ")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");

const group = (tag) => {
  if (tag === "API keys") return "keys";
  const name = pascal(tag);
  return name[0].toLowerCase() + name.slice(1);
};

const nouns = (tag) => {
  if (tag === "API keys") return ["EnvironmentKeys", "EnvironmentKey"];
  const name = pascal(tag);
  return [name, name.replace(/s$/, "")];
};

const methodName = (operationId, tag) => {
  let name = operationId;
  for (const noun of nouns(tag)) name = name.replace(noun, "");
  return name ? name[0].toLowerCase() + name.slice(1) : operationId;
};

export default {
  input: spec,
  output: { path: "./src/generated", importFileExtension: ".js" },
  plugins: [
    {
      name: "@hey-api/client-fetch",
      baseUrl: "https://api.subscriber.dev",
      throwOnError: true,
    },
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      paramsStructure: "flat",
      operations: {
        strategy: "single",
        containerName: "Api",
        nesting: (operation) => [
          group(operation.tags[0]),
          methodName(operation.operationId, operation.tags[0]),
        ],
      },
    },
  ],
};
