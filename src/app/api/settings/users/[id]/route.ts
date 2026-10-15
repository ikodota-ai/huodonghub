import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  role: z.enum(["admin", "maintainer", "editor"]).optional(),
  status: z.number().int().min(0).max(1).optional(),
  password: z.string().min(6).max(64).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const d = parsed.data;
    // 保护最后一个 admin：不允许把自己或最后一个管理员降级/停用
    if ((d.role && d.role !== "admin") || d.status === 0) {
      const target = await db.user.findUnique({ where: { id: BigInt(params.id) }, select: { role: true } });
      if (target?.role === "admin") {
        const admins = await db.user.count({ where: { role: "admin", status: 1 } });
        if (admins <= 1) return fail("至少保留一个可用的管理员账号");
      }
    }
    await db.user.update({
      where: { id: BigInt(params.id) },
      data: {
        name: d.name, role: d.role, status: d.status,
        ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 10) } : {}),
      },
    });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const id = BigInt(params.id);
    if (id === user.id) return fail("不能删除自己");
    // 有内容的账号禁止删除（内容随账号消失会带走现场链接与数据），建议改为停用
    const [voteCount, groupCount] = await Promise.all([
      db.vote.count({ where: { ownerId: id } }),
      db.videoGroup.count({ where: { ownerId: id } }),
    ]);
    if (voteCount + groupCount > 0) {
      return fail(`该账号名下有 ${voteCount} 个投票、${groupCount} 个视频分组，删除会带走数据。请改为「停用」，或先将内容移交其他账号`);
    }
    const target = await db.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "admin") {
      const admins = await db.user.count({ where: { role: "admin", status: 1 } });
      if (admins <= 1) return fail("至少保留一个管理员账号");
    }
    await db.user.delete({ where: { id } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
