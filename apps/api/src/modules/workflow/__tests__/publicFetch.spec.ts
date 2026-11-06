import { describe, expect, it } from "vitest";

import { fetchPublic, isPrivateAddress } from "../publicFetch.js";

describe("fetchPublic", () => {
  it("knows private from public addresses", () => {
    for (const address of [
      "10.0.2.26",
      "127.0.0.1",
      "169.254.169.254",
      "172.20.0.1",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["1.1.1.1", "162.159.135.232", "2606:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("refuses private IPs and hostnames that resolve to them", async () => {
    await expect(fetchPublic("http://127.0.0.1:65000/", {})).rejects.toThrow(
      "private address",
    );
    await expect(fetchPublic("http://[::1]:65000/", {})).rejects.toThrow(
      "private address",
    );
    await expect(fetchPublic("http://localhost:65000/", {})).rejects.toThrow(
      "points to a private address",
    );
  });
});
