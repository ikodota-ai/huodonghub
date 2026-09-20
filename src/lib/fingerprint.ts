import { sha256 } from "./codes";
import { headers } from "next/headers";

export function clientIp(): string {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "0.0.0.0";
}

// 无服务号时的降级身份：客户端指纹 + IP 段 + UA 哈希
export function fallbackVoterKey(clientFp: string): string {
  const h = headers();
  const ua = h.get("user-agent") || "";
  return "fp_" + sha256(`${clientFp}|${clientIp()}|${ua}`).slice(0, 32);
}
