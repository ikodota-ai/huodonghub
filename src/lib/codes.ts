import crypto from "crypto";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function shortCode(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function token(len = 32): string {
  return crypto.randomBytes(len).toString("base64url");
}

export function mediaKey(len = 24): string {
  return crypto.randomBytes(len).toString("hex");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
