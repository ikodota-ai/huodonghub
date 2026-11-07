import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { rebuildGroupStats } from "@/lib/scoring";
import { canAccess, voteOwnerByVoter } from "@/lib/ownership";
import { isRoundDraft, roundDataLockedMessage } from "@/lib/round-lifecycle";

const resetSchema = z.object({ mode: z.enum(["binding", "full"]).optional() });

// 重置绑定与提交状态（评委换设备/重投）
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const id = BigInt(params.id);
    if (!canAccess(user, await voteOwnerByVoter(id))) return fail("评审不存在", 404);
    const parsed = resetSchema.safeParse(await _req.json().catch(() => ({})));
    if (!parsed.success) return fail("参数错误");
    const voter = await db.voter.findUnique({
      where: { id },
      include: { group: { select: { round: { select: { status: true } } } } },
    });
    if (!voter) return fail("评审不存在", 404);
    if (parsed.data.mode === "binding") {
      await db.voter.update({ where: { id }, data: { boundKey: null, boundAt: null } });
      return ok(true);
    }
    if (!isRoundDraft(voter.group.round.status)) return fail(roundDataLockedMessage(voter.group.round.status), 409);
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
