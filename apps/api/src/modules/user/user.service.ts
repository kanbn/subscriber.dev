import { Injectable, NotFoundException } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as userRepo from "@subscriber.dev/db/repository/user.repo";

@Injectable()
export class UserService {
  async getUser(db: dbClient, userId: string) {
    const result = await userRepo.getById(db, userId);

    if (!result) {
      throw new NotFoundException("User not found");
    }

    return {
      ...result,
    };
  }

  async updateUser(
    db: dbClient,
    userId: string,
    data: { name?: string; image?: string },
  ) {
    const result = await userRepo.update(db, userId, data);

    if (!result) {
      throw new NotFoundException("User not found");
    }

    return result;
  }
}
