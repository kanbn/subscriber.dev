import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: {
      target: "../../apps/api/openapi.json",
      parserOptions: {
        validate: false,
      },
    },
    output: {
      target: "./src/generated.ts",
      client: "react-query",
      httpClient: "fetch",
      baseUrl: "http://localhost:3001",
      override: {
        requestOptions: {
          credentials: "include",
        },
      },
    },
  },
});
