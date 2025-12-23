import { User } from '@subscriber.dev/auth/server';
import type { dbClient } from '@subscriber.dev/db/client';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      db?: dbClient;
      auth?: any;
      headers?: Headers;
    }
  }
}



