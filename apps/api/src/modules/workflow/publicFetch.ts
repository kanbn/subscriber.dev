import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import type { LookupFunction } from "node:net";
import type { RequestInit } from "undici";
import { Agent, fetch } from "undici";

const privateRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv6");
}

export function isPrivateAddress(address: string) {
  return privateRanges.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

const publicLookup: LookupFunction = (hostname, options, callback) =>
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      return callback(
        new Error(`${hostname} points to a private address`),
        "",
        0,
      );
    }
    if (options.all) return callback(null, addresses, 0);
    callback(null, addresses[0].address, addresses[0].family);
  });

const publicAgent = new Agent({ connect: { lookup: publicLookup } });

export async function fetchPublic(
  url: string,
  init: RequestInit,
) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) {
    throw new Error(`${host} is a private address`);
  }
  return await fetch(url, { ...init, dispatcher: publicAgent }).catch(
    (error: Error) => {
      throw error.cause instanceof Error ? error.cause : error;
    },
  );
}
