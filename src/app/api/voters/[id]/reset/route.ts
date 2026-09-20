import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { rebuildGroupStats } from "@/lib/scoring";

// 重置绑定与提交状态（评委换设备/重投）
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const id = BigInt(params.id);
    const voter = await db.voter.findUnique({ where: { id } });
    if (!voter) return fail("评审不存在", 404);
    await db.$transaction([
      db.scoreEntry.deleteMany({ where: { voterId: id } }),
      db.voteEntry.deleteMany({ where: { groupId: voter.groupId, voterKey: `voter_${id}` } }),
      db.voter.update({ where: { id }, data: { boundKey: null, boundAt: null, hasVoted: 0, votedAt: null } }),
    ]);
    await rebuildGroupStats(voter.groupId);
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
