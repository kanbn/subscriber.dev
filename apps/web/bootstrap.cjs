// The standalone server skips next.config.js, so write __ENV.js and migrate here.
const { spawnSync } = require("child_process");
const { writeFileSync } = require("fs");
const path = require("path");

const publicEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.startsWith("NEXT_PUBLIC_")),
);
writeFileSync(
  path.join(__dirname, "apps", "web", "public", "__ENV.js"),
  `window.__ENV = ${JSON.stringify(publicEnv)};`,
);

if (process.env.POSTGRES_URL) {
  const migrateDir = path.join(__dirname, "migrate");
  const result = spawnSync(
    process.execPath,
    [path.join(migrateDir, "node_modules", "drizzle-kit", "bin.cjs"), "migrate"],
    { cwd: migrateDir, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

require("./apps/web/server.js");
