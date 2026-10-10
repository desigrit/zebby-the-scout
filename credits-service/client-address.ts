import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export function trustedProxyHops(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 0;
  if (!/^[0-4]$/.test(value.trim())) throw new Error("ZEBBY_TRUST_PROXY_HOPS must be an integer from 0 to 4.");
  return Number(value.trim());
}

function normalize(value: string): string | undefined {
  const address = value.trim();
  if (address.includes("%") || !isIP(address)) return undefined;
  return ipaddr.process(address).toString();
}

// Trust a fixed number of host-controlled hops, counted from the socket peer.
// Untrusted values prepended by a client never determine its rate-limit bucket.
export function clientAddress(peer: string | undefined, forwarded: string | string[] | undefined, hops = 0): string {
  const socket = normalize(peer || "") || "unknown";
  if (!Number.isInteger(hops) || hops < 1 || hops > 4 || typeof forwarded !== "string" || forwarded.length > 2048) return socket;
  const addresses = forwarded.split(",");
  if (addresses.length < hops || addresses.length > 16) return socket;
  const chain = addresses.map(normalize);
  if (chain.some((address) => !address)) return socket;
  return chain[chain.length - hops] || socket;
}
