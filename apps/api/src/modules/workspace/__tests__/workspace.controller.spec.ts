import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserService } from "../../user/user.service.js";
import { WorkspaceController } from "../workspace.controller.js";
import { WorkspaceService } from "../workspace.service.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

const mockUser = { id: 1, email: "user@example.com" };

const mockWorkspaceService = {
  getWorkspaceForUser: vi.fn(),
  createEnvironment: vi.fn(),
};

const mockUserService = {
  getUser: vi.fn(),
};

let controller: WorkspaceController;

beforeEach(async () => {
  vi.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [WorkspaceController],
    providers: [
      { provide: WorkspaceService, useValue: mockWorkspaceService },
      { provide: UserService, useValue: mockUserService },
    ],
  }).compile();

  controller = module.get(WorkspaceController);
});

describe("createEnvironment", () => {
  it("delegates to the service when the workspace exists", async () => {
    mockWorkspaceService.getWorkspaceForUser.mockResolvedValue({
      id: 10,
      publicId: "ws_abc",
    });
    mockWorkspaceService.createEnvironment.mockResolvedValue({
      publicId: "env_abc",
      name: "Staging",
      slug: "staging",
    });

    const result = await controller.createEnvironment(
      mockUser as any,
      "ws_abc",
      { name: "Staging" } as any,
    );

    expect(result).toEqual({
      publicId: "env_abc",
      name: "Staging",
      slug: "staging",
    });
    expect(mockWorkspaceService.createEnvironment).toHaveBeenCalledWith(
      {},
      10,
      1,
      { name: "Staging" },
    );
  });

  it("throws NotFoundException when the workspace doesn't exist or the user has no access", async () => {
    mockWorkspaceService.getWorkspaceForUser.mockResolvedValue(undefined);

    await expect(
      controller.createEnvironment(mockUser as any, "ws_missing", {
        name: "Staging",
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(mockWorkspaceService.createEnvironment).not.toHaveBeenCalled();
  });
});
