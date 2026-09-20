import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({
  voteId: z.coerce.bigint(),
  name: z.string().min(1).max(128),
  intro: z.string().max(1000).optional(),
  image: z.string().max(255).optional(),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const d = parsed.data;
    const agg = await db.voteContestant.aggregate({ where: { voteId: d.voteId }, _max: { sort: true }, _count: true });
    const contestant = await db.voteContestant.create({
      data: {
        voteId: d.voteId, name: d.name, intro: d.intro, image: d.image || null,
        number: String((agg._count ?? 0) + 1).padStart(2, "0"), sort: (agg._max.sort ?? 0) + 1,
      },
    });
    return ok({ id: contestant.id.toString(), number: contestant.number });
  } catch (e) {
    return handleError(e);
  }
}
