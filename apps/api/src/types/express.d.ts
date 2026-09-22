import type { dbClient } from "@subscriber.dev/db/client";
import { User } from "@subscriber.dev/auth/server";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      db?: dbClient;
      auth?: any;
    }
  }
}
