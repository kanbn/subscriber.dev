// The standalone server skips next.config.js, so write __ENV.js here.
const { writeFileSync } = require("fs");
const path = require("path");

const publicEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.startsWith("NEXT_PUBLIC_")),
);
writeFileSync(
  path.join(__dirname, "apps", "web", "public", "__ENV.js"),
  `window.__ENV = ${JSON.stringify(publicEnv)};`,
);

const drainMs = 10_000;
const on = process.on.bind(process);
process.on = (event, listener) =>
  on(event, event === "SIGTERM" ? () => setTimeout(listener, drainMs, event) : listener);

require("./apps/web/server.js");
