import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { rebuildGroupStats } from "@/lib/scoring";
import { canAccess, voteOwnerByVoter } from "@/lib/ownership";
import { isRoundDraft } from "@/lib/round-lifecycle";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  needBind: z.number().int().min(0).max(1).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!canAccess(user, await voteOwnerByVoter(BigInt(params.id)))) return fail("评审不存在", 404);
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
    const user = await requireUser();
    if (!canAccess(user, await voteOwnerByVoter(BigInt(params.id)))) return fail("评审不存在", 404);
    const voter = await db.voter.findUnique({
      where: { id: BigInt(params.id) },
      include: { group: { select: { round: { select: { status: true } } } }, _count: { select: { scoreEntries: true } } },
    });
    if (!voter) return fail("评审不存在", 404);
    const voteCount = await db.voteEntry.count({ where: { groupId: voter.groupId, voterKey: `voter_${voter.id}` } });
    if (!isRoundDraft(voter.group.round.status) && (voter._count.scoreEntries > 0 || voteCount > 0)) {
      return fail("轮次已开始，不能删除已有评分或投票的评审", 409);
    }
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
