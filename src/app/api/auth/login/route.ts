import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

const attempts = new Map<string, { count: number; lockedUntil: number }>();

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("请输入用户名和密码");
  const username = parsed.data.username.trim();
  const password = parsed.data.password.trim();

  const ip = req.headers.get("x-forwarded-for") || "local";
  const rec = attempts.get(ip);
  if (rec && rec.lockedUntil > Date.now()) return fail("失败次数过多，请 10 分钟后再试", 429);

  const user = await db.user.findUnique({ where: { username } });
  const valid = user && user.status === 1 && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) {
    const next = { count: (rec?.count ?? 0) + 1, lockedUntil: 0 };
    if (next.count >= 5) { next.lockedUntil = Date.now() + 10 * 60 * 1000; next.count = 0; }
    attempts.set(ip, next);
    const left = 5 - next.count;
    return fail(next.lockedUntil > 0 ? "失败次数过多，已锁定 10 分钟" : `用户名或密码错误（还可试 ${left} 次）`, 401);
  }
  attempts.delete(ip);
  await createSession(user!.id);
  return ok({ name: user!.name, role: user!.role });
}
