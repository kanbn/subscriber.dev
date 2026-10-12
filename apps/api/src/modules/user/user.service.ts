import { Injectable, NotFoundException } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as userRepo from "@subscriber.dev/db/repository/user.repo";

@Injectable()
export class UserService {
  async getUser(db: dbClient, userId: number) {
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

  async listAgents(db: dbClient, userId: number) {
    const agents = await userRepo.listAgents(db, userId);
    return agents.map((agent) => ({
      ...agent,
      connectedAt: agent.connectedAt.toISOString(),
    }));
  }

  async disconnectAgent(db: dbClient, userId: number, clientId: string) {
    const disconnected = await userRepo.disconnectAgent(db, userId, clientId);

    if (!disconnected) {
      throw new NotFoundException("Agent not found");
    }
  }
}
