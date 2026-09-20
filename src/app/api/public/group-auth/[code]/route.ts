import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { sha256 } from "@/lib/codes";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const group = await db.videoGroup.findUnique({ where: { code: params.code } });
  if (!group || group.status !== 1) return fail("内容不存在或未开放", 404);
  const parsed = z.object({ password: z.string() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("请输入密码");
  if (!group.password || parsed.data.password !== group.password) return fail("密码错误", 403);
  cookies().set(`vg_auth_${group.code}`, sha256(`${group.code}|${group.password}|ok`), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600,
  });
  return ok(true);
}
