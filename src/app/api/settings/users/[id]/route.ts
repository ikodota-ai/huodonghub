import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  role: z.enum(["admin", "editor"]).optional(),
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
    await db.user.delete({ where: { id } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
