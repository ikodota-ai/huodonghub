import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { canAccess } from "@/lib/ownership";

const schema = z.object({ orders: z.array(z.object({ id: z.coerce.bigint(), sort: z.number().int() })).max(500) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    // 校验每条视频的分组归属，防止跨账号改排序
    const owners = await db.video.findMany({
      where: { id: { in: parsed.data.orders.map((o) => o.id) } },
      select: { group: { select: { ownerId: true } } },
    });
    if (owners.length !== parsed.data.orders.length || owners.some((v) => !canAccess(user, v.group.ownerId))) {
      return fail("存在无权操作的视频", 404);
    }
    await db.$transaction(
      parsed.data.orders.map((o) => db.video.update({ where: { id: o.id }, data: { sort: o.sort } }))
    );
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
