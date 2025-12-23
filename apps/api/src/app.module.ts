import { Module } from '@nestjs/common';
import { UserModule } from './modules/user/user.module.js';
import { TestModule } from './modules/test/test.module.js';

@Module({
  imports: [
    UserModule,
    TestModule,
  ],
})
export class AppModule {}

