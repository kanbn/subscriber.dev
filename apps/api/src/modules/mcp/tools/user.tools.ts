import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { UpdateUserSchema } from "../../user/dto/user.dto.js";
import { UserService } from "../../user/user.service.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

@Injectable()
export class UserTools {
  constructor(private readonly userService: UserService) {}

  @Tool({
    name: "get_current_user",
    description: "Get the current authenticated user.",
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
  })
  async getCurrentUser(
    _args: Record<string, never>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    return this.userService.getUser(db, user.id);
  }

  @Tool({
    name: "update_user",
    description: "Update the current user.",
    parameters: UpdateUserSchema,
  })
  async updateUser(
    args: z.infer<typeof UpdateUserSchema>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    return this.userService.updateUser(db, user.publicId, args);
  }
}
