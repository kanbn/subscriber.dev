import { Module } from "@nestjs/common";

import {
  CurrentEnvironmentKeyController,
  EnvironmentKeysController,
} from "./environmentKeys.controller.js";
import { EnvironmentKeysService } from "./environmentKeys.service.js";

@Module({
  controllers: [EnvironmentKeysController, CurrentEnvironmentKeyController],
  providers: [EnvironmentKeysService],
  exports: [EnvironmentKeysService],
})
export class EnvironmentKeysModule {}
