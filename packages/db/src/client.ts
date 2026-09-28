import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePgLite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

export type dbClient = NodePgDatabase<typeof schema> & {
  $client: Pool;
};

const DEFAULT_POOL_MAX = 20;

let client: dbClient | undefined;

export const createDrizzleClient = (): dbClient => {
  if (client) return client;

  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    console.log("POSTGRES_URL environment variable is not set, using PGLite");

    const pglite = new PGlite({
      dataDir: "./pgdata",
      extensions: { uuid_ossp },
    });
    const db = drizzlePgLite(pglite, { schema });

    migrate(db, { migrationsFolder: "../../packages/db/migrations" });

    client = db as unknown as dbClient;
    return client;
  }

  const pool = new Pool({
    connectionString,
    max: Number(process.env.POSTGRES_POOL_MAX) || DEFAULT_POOL_MAX,
  });

  client = drizzlePg(pool, { schema }) as dbClient;
  return client;
};
