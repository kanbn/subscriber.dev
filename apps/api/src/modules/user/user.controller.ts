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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import {
  UpdateUserDto,
  UpdateUserResponseDto,
  UserResponseDto,
} from "./dto/user.dto.js";
import { UserService } from "./user.service.js";

@ApiTags("Users")
@ApiBearerAuth("bearer")
@Controller("users")
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  @ApiOperation({ operationId: "getCurrentUser", summary: "Get current user" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getUser(
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const db = createDrizzleClient();
    return this.userService.getUser(db, user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateCurrentUser",
    summary: "Update current user",
  })
  @ApiResponse({ status: 200, type: UpdateUserResponseDto })
  async updateUser(
    @CurrentUser() user: User,
    @Body() input: UpdateUserDto,
    @Req() req: Request,
  ): Promise<UpdateUserResponseDto> {
    const db = createDrizzleClient();
    return this.userService.updateUser(db, user.publicId, input);
  }
}
