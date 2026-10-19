import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import type { EnvironmentKeyScope } from "@subscriber.dev/shared/environmentKeys";
import { generateUID } from "@subscriber.dev/shared/utils";

import { environments } from "./environments.js";
import { users } from "./users.js";

export const environmentKeys = pgTable(
  "environment_keys",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    environmentId: bigint("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    keyHash: text("keyHash").notNull().unique(),
    start: varchar("start", { length: 32 }).notNull(),
    scopes: text("scopes").array().notNull().$type<EnvironmentKeyScope[]>(),
    createdBy: bigint("createdBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    lastUsedAt: timestamp("lastUsedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [
    index("environment_keys_environmentId_idx").on(table.environmentId),
  ],
);
