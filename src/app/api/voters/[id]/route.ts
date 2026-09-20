import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { rebuildGroupStats } from "@/lib/scoring";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  needBind: z.number().int().min(0).max(1).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.voter.update({ where: { id: BigInt(params.id) }, data: parsed.data });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const voter = await db.voter.findUnique({ where: { id: BigInt(params.id) } });
    if (!voter) return fail("评审不存在", 404);
    // 连带清理其投票流水，再重建群体计数器
    await db.$transaction([
      db.voteEntry.deleteMany({ where: { groupId: voter.groupId, voterKey: `voter_${voter.id}` } }),
      db.voter.delete({ where: { id: voter.id } }),
    ]);
    await rebuildGroupStats(voter.groupId);
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
