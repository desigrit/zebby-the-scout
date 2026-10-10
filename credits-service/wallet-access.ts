import { createHash, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { deviceNameSchema, deviceTokenSchema, guestSessionSchema, pairingCodeSchema, recoveryCodeSchema } from "../shared/wallet-access.ts";
import { ServiceError } from "./errors.ts";

type AccessDependencies = {
  rpc: <T = unknown>(name: string, value: unknown) => Promise<T>;
  rateLimit: (key: string, maximum: number, duration?: number) => void;
};
export function createWalletAccess({ rpc, rateLimit }: AccessDependencies) {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const deviceInput = z.object({ deviceToken: deviceTokenSchema, name: deviceNameSchema });
  async function authenticate(token: string) {
    if (!deviceTokenSchema.safeParse(token).success) throw new ServiceError("This computer is not connected to a credit wallet.", 401);
    const session = await rpc("device_session", { p_hash: digest(token) });
    if (!session) throw new ServiceError("This computer was disconnected. Restore credits or connect it again in Settings.", 401);
    const value = guestSessionSchema.parse(session);
    return { id: value.walletId, deviceId: value.deviceId, email: "" };
  }
  async function connect(path: string, body: unknown, ip: string) {
    rateLimit("wallet-connect:" + ip, 8, 15 * 60000);
    if (path === "/v1/wallet/guest") {
      rateLimit("wallet-create:" + ip, 10, 3600000);
      const value = deviceInput.strict().parse(body);
      return rpc("guest", { p_device: randomUUID(), p_hash: digest(value.deviceToken), p_name: value.name });
    }
    const pair = path === "/v1/wallet/connect";
    const value = deviceInput.extend({ code: pair ? pairingCodeSchema : recoveryCodeSchema }).strict().parse(body);
    const codeHash = digest(value.code);
    const result = await rpc(pair ? "connect_device" : "recover_device", { p_device: randomUUID(),
      p_hash: digest(value.deviceToken), p_name: value.name, p_code: codeHash });
    if (!result) throw new ServiceError(pair ? "That pairing code was used or expired. Generate a new code on your other computer."
      : "That recovery code is not valid. Check it and try again.");
    return guestSessionSchema.parse(result);
  }
  async function manage(method: string, path: string, body: unknown, account: { id: string; deviceId?: string }) {
    if (method === "GET" && path === "/v1/wallet/session") {
      if (!account.deviceId) throw new ServiceError("Update this computer's wallet connection first.");
      return { walletId: account.id, deviceId: account.deviceId };
    }
    if (method === "POST" && path === "/v1/wallet/device") {
      const value = deviceInput.strict().parse(body);
      return rpc("attach_device", { p_user: account.id, p_device: randomUUID(), p_hash: digest(value.deviceToken),
        p_name: value.name, p_connection: digest("legacy:" + account.id) });
    }
    if (method === "GET" && path === "/v1/wallet/access") return rpc("wallet_access", { p_user: account.id, p_current: account.deviceId || null });
    if (method === "POST" && path === "/v1/wallet/recovery") {
      rateLimit("wallet-recovery:" + account.id, 5, 15 * 60000);
      const { code } = z.object({ code: recoveryCodeSchema }).strict().parse(body);
      return rpc("set_recovery", { p_user: account.id, p_code: digest(code) });
    }
    if (method === "POST" && path === "/v1/wallet/pairing") {
      rateLimit("wallet-pairing:" + account.id, 10, 15 * 60000);
      z.object({}).strict().parse(body);
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
      const result = await rpc<{ expiresAt: string }>("start_pairing", { p_user: account.id, p_code: digest(code) });
      return { code, expiresAt: result.expiresAt };
    }
    if (method === "POST" && path === "/v1/wallet/pairing/cancel") {
      const { code } = z.object({ code: pairingCodeSchema }).strict().parse(body);
      await rpc("cancel_pairing", { p_user: account.id, p_code: digest(code) });
      return { cancelled: true };
    }
    if (method === "POST" && /^\/v1\/wallet\/devices\/[\da-f-]{36}\/remove$/i.test(path)) {
      const id = z.string().uuid().parse(path.split("/")[4]);
      z.object({}).strict().parse(body);
      if (id === account.deviceId) throw new ServiceError("You cannot disconnect the computer you are using.");
      if (!await rpc("remove_device", { p_user: account.id, p_device: id })) throw new ServiceError("Computer not found.", 404);
      return { removed: true };
    }
    return undefined;
  }
  return { authenticate, connect, manage };
}
