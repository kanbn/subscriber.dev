import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { TestRequestDto, TestResponseDto } from "./dto/test.dto.js";
import { TestService } from "./test.service.js";

@ApiTags("Test")
@ApiBearerAuth("bearer")
@Controller("test")
@UseGuards(AuthGuard)
export class TestController {
  constructor(private readonly testService: TestService) {}

  @Get()
  @ApiOperation({ operationId: "getTest", summary: "Get test message" })
  @ApiResponse({ status: 200, type: TestResponseDto })
  async getTest(@CurrentUser() user: User): Promise<TestResponseDto> {
    return this.testService.getTest();
  }

  @Post()
  @ApiOperation({ operationId: "createTest", summary: "Post test data" })
  @ApiResponse({ status: 200, type: TestResponseDto })
  async postTest(
    @CurrentUser() user: User,
    @Body() data: TestRequestDto,
  ): Promise<TestResponseDto> {
    return this.testService.postTest(data);
  }
}
