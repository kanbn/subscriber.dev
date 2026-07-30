import type { Request } from "express";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { UserService } from "./user.service.js";

const updateUserSchema = z.object({
  name: z.string().optional(),
  image: z.string().optional(),
});

@ApiTags("Users")
@ApiBearerAuth("bearer")
@Controller("users")
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  @ApiOperation({ operationId: "getCurrentUser", summary: "Get current user" })
  async getUser(@CurrentUser() user: User, @Req() req: Request) {
    const db = createDrizzleClient();
    return this.userService.getUser(db, user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateCurrentUser",
    summary: "Update current user",
  })
  async updateUser(
    @CurrentUser() user: User,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const db = createDrizzleClient();
    const input = updateUserSchema.parse(body);
    return this.userService.updateUser(db, user.publicId, input);
  }
}
