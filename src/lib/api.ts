import { NextResponse } from "next/server";
import { AuthError, currentUser } from "./auth";
import { ZodError } from "zod";

export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function adminUser() {
  const user = await currentUser();
  return user;
}

export function handleError(e: unknown) {
  if (e instanceof AuthError) return fail("未登录或登录已过期", 401);
  if (e instanceof ZodError) return fail("参数错误：" + e.issues.map((i) => i.message).join("；"), 400);
  console.error(e);
  return fail("服务器内部错误", 500);
}
