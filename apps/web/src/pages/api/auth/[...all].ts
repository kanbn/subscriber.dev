import { toNodeHandler } from "better-auth/node";

import { initAuth } from "@subscriber.dev/auth/server";
import { createDrizzleClient } from "@subscriber.dev/db/client";

export const config = { api: { bodyParser: false } };

export const auth = initAuth(createDrizzleClient());

export default toNodeHandler(auth.handler);
