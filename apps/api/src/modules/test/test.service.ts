import { Injectable } from '@nestjs/common';
import { TestRequestDto, TestResponseDto } from './dto/test.dto.js';

@Injectable()
export class TestService {
  getTest(): TestResponseDto {
    return {
      message: 'Hello from NestJS API!',
      timestamp: new Date().toISOString(),
      success: true,
    };
  }

  postTest(data: TestRequestDto): TestResponseDto {
    return {
      message: `Received: ${data.name}`,
      timestamp: new Date().toISOString(),
      success: true,
      echo: data,
    };
  }
}
