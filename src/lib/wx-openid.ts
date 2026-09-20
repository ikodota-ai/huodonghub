import crypto from "crypto";
import { cookies } from "next/headers";

const SECRET = () => process.env.SESSION_SECRET || "dth-dev-secret";

export function wxCookieName(voteId: bigint | string): string {
  return `wx_openid_${voteId}`;
}

export function signOpenid(openid: string): string {
  const sig = crypto.createHmac("sha256", SECRET()).update(openid).digest("base64url").slice(0, 16);
  return `${openid}.${sig}`;
}

export function verifyOpenid(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const openid = signed.slice(0, idx);
  return signOpenid(openid) === signed ? openid : null;
}

export async function wxOpenidFromCookies(voteId: bigint | string): Promise<string | null> {
  const raw = cookies().get(wxCookieName(voteId))?.value;
  return raw ? verifyOpenid(raw) : null;
}
