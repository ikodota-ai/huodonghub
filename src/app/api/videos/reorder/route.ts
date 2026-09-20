import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({ orders: z.array(z.object({ id: z.coerce.bigint(), sort: z.number().int() })).max(500) });

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.$transaction(
      parsed.data.orders.map((o) => db.video.update({ where: { id: o.id }, data: { sort: o.sort } }))
    );
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
