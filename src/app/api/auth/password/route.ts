import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(64),
});

// 个人自助改密（任何登录用户）：验证旧密码，改密后踢掉其他会话
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("新密码至少 6 位");
    const { oldPassword, newPassword } = parsed.data;
    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) return fail("原密码不正确");
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    const current = cookies().get("dth_session")?.value;
    await db.session.deleteMany({ where: { userId: user.id, id: { not: current } } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
