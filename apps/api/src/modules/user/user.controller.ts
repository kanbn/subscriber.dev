import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { createDrizzleClient } from '@subscriber.dev/db/client';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UserService } from './user.service.js';
import type { User } from '../../common/interfaces/user.interface.js';

const updateUserSchema = z.object({
  name: z.string().optional(),
  image: z.string().optional(),
});

@ApiTags('Users')
@ApiBearerAuth('bearer')
@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ operationId: 'getCurrentUser', summary: 'Get current user' })
  async getUser(@CurrentUser() user: User, @Req() req: Request) {
    const db = createDrizzleClient();
    return this.userService.getUser(db, user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'updateCurrentUser', summary: 'Update current user' })
  async updateUser(
    @CurrentUser() user: User,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const db = createDrizzleClient();
    const input = updateUserSchema.parse(body);
    return this.userService.updateUser(db, user.id, input);
  }
}

