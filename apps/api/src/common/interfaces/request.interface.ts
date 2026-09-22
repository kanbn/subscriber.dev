import type { Request } from "express";

import type { dbClient } from "@subscriber.dev/db/client";

import type { User } from "./user.interface.js";

export interface AuthenticatedRequest extends Request {
  user: User;
  db: dbClient;
  auth: any;
}
