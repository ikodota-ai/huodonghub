import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { canAccess, voteOwnerByVoter } from "@/lib/ownership";

// 评委评分记录：该评委对本轮各位选手的给分明细（评分制，含逐分折算）或勾选记录（投票制限定群体）。
// 逐分折算 = 打分 ÷ 参评人数 × 权重%（参评人数口径随 avgMode，与 computeRoundResults 一致）。
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const voterId = BigInt(params.id);
    if (!canAccess(user, await voteOwnerByVoter(voterId))) return fail("评审不存在", 404);
    const voter = await db.voter.findUnique({
      where: { id: voterId },
      include: {
        group: {
          include: {
            round: {
              include: {
                roundContestants: {
                  include: { contestant: { select: { id: true, number: true, name: true } } },
                  orderBy: { contestant: { sort: "asc" } },
                },
              },
            },
          },
        },
      },
    });
    if (!voter) return fail("评审不存在", 404);
    const g = voter.group;
    const round = g.round;
    const weight = Number(g.weight);
    const base = {
      voter: { id: voter.id.toString(), name: voter.name, hasVoted: voter.hasVoted },
      group: { id: g.id.toString(), name: g.name, kind: g.kind, weight, roundName: round.name },
    };

    if (g.kind === "score") {
      // 参评人数口径：scorers=该选手实际评分人数；roster=全组评委人数（与计分一致）
      const rosterCount = g.avgMode === "roster" ? await db.voter.count({ where: { groupId: g.id } }) : 0;
      const scorerRows: { contestant_id: bigint; c: bigint }[] = await db.$queryRaw`
        SELECT contestant_id, COUNT(DISTINCT voter_id) AS c FROM score_entries WHERE group_id = ${g.id} GROUP BY contestant_id`;
      const scorerOf = new Map(scorerRows.map((r) => [r.contestant_id.toString(), Number(r.c)]));
      const entries = await db.scoreEntry.findMany({ where: { groupId: g.id, voterId } });
      const scoreOf = new Map(entries.map((e) => [e.contestantId.toString(), Number(e.score)]));
      return ok({
        ...base,
        entries: round.roundContestants.map((rc) => {
          const cid = rc.contestantId.toString();
          const score = scoreOf.get(cid) ?? null;
          const participants = g.avgMode === "roster" ? rosterCount : (scorerOf.get(cid) ?? 0);
          return {
            contestantId: cid, number: rc.contestant.number, name: rc.contestant.name, batch: rc.batch,
            score,
            share: score != null && participants > 0 ? Math.round(((score / participants) * (weight / 100)) * 100) / 100 : null,
          };
        }),
      });
    }

    // 投票制限定群体：该评委的勾选记录
    const picks = await db.voteEntry.findMany({ where: { groupId: g.id, voterKey: `voter_${voter.id}` } });
    const picked = new Set(picks.map((p) => p.contestantId.toString()));
    return ok({
      ...base,
      entries: round.roundContestants.map((rc) => ({
        contestantId: rc.contestantId.toString(), number: rc.contestant.number, name: rc.contestant.name, batch: rc.batch,
        picked: picked.has(rc.contestantId.toString()),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
