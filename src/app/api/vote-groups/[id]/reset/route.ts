import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { publish, screenChannel } from "@/lib/sse";
import { canAccess, voteOwnerByGroup } from "@/lib/ownership";
import { canClearVoteData, voteDataLockedMessage } from "@/lib/vote-lifecycle";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const groupId = BigInt(params.id);
    if (!canAccess(user, await voteOwnerByGroup(groupId))) return fail("群体不存在", 404);
    const group = await db.voteGroup.findUnique({
      where: { id: groupId },
      select: { id: true, roundId: true, kind: true, round: { select: { vote: { select: { status: true } } } } },
    });
    if (!group) return fail("群体不存在", 404);
    if (group.kind !== "vote") return fail("仅投票群体支持清空测试票");
    if (!canClearVoteData(group.round.vote.status)) return fail(voteDataLockedMessage(group.round.vote.status), 409);
    await db.$transaction([
      db.voteEntry.deleteMany({ where: { groupId } }),
      db.groupStat.deleteMany({ where: { groupId } }),
      db.voter.updateMany({ where: { groupId }, data: { hasVoted: 0, votedAt: null } }),
    ]);
    publish(screenChannel(group.roundId.toString()), "update", { reason: "group_reset" });
    return ok(true);
  } catch (error) {
    return handleError(error);
  }
}

export const dynamic = "force-dynamic";
