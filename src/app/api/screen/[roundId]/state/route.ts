import { ok, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults } from "@/lib/scoring";

export async function GET(_req: Request, { params }: { params: { roundId: string } }) {
  try {
    const round = await db.voteRound.findUnique({
      where: { id: BigInt(params.roundId) },
      include: { vote: true, groups: { orderBy: { sort: "asc" } }, roundContestants: { select: { contestantId: true, batch: true } } },
    });
    if (!round) return ok(null);
    const allResults = await computeRoundResults(round.id);
    // 批次模式：大屏只展示当前批次选手（currentBatch=0 时展示全部）
    const currentBatch = round.currentBatch;
    const batches = [...new Set(round.roundContestants.map((rc) => rc.batch).filter((b) => b > 0))].sort((a, b) => a - b);
    const results = currentBatch > 0 ? allResults.filter((r) => r.batch === currentBatch) : allResults;
    // 各群体参与情况（评分/限定群体：已交/总数；开放投票：参与人数）——分批时按当前批次口径
    const participation = await Promise.all(round.groups.map(async (g) => {
      if (g.kind === "score") {
        const total = await db.voter.count({ where: { groupId: g.id } });
        if (currentBatch > 0) {
          const rows: { c: bigint }[] = await db.$queryRaw`
            SELECT COUNT(DISTINCT se.voter_id) AS c FROM score_entries se
            JOIN round_contestants rc ON rc.contestant_id = se.contestant_id AND rc.round_id = ${round.id}
            WHERE se.group_id = ${g.id} AND rc.batch = ${currentBatch}`;
          return { groupId: g.id.toString(), done: Number(rows[0]?.c ?? 0), total };
        }
        const done = await db.voter.count({ where: { groupId: g.id, hasVoted: 1 } });
        return { groupId: g.id.toString(), done, total };
      }
      if (g.restricted === 1) {
        const total = await db.voter.count({ where: { groupId: g.id } });
        const done = await db.voter.count({ where: { groupId: g.id, hasVoted: 1 } });
        return { groupId: g.id.toString(), done, total };
      }
      const rows: { c: bigint }[] = currentBatch > 0
        ? await db.$queryRaw`
          SELECT COUNT(DISTINCT ve.voter_key) AS c FROM vote_entries ve
          JOIN round_contestants rc ON rc.contestant_id = ve.contestant_id AND rc.round_id = ${round.id}
          WHERE ve.group_id = ${g.id} AND rc.batch = ${currentBatch}`
        : await db.$queryRaw`
          SELECT COUNT(DISTINCT voter_key) AS c FROM vote_entries WHERE group_id = ${g.id}`;
      return { groupId: g.id.toString(), done: Number(rows[0]?.c ?? 0), total: 0 };
    }));
    return ok({
      voteName: round.vote.name,
      cover: round.vote.cover,
      roundName: round.name,
      status: round.status,
      code: round.code,
      screenGroupId: round.screenGroupId?.toString() ?? null,
      screenQrMode: round.screenQrMode === 1,
      screenShowResult: round.screenShowResult === 1,
      screenShowPart: round.screenShowPart === 1,
      screenPageSize: round.screenPageSize,
      countdownEndsAt: round.countdownEndsAt,
      currentBatch,
      batches,
      groups: round.groups.map((g) => ({
        id: g.id.toString(), name: g.name, kind: g.kind, weight: Number(g.weight),
      })),
      participation,
      results: results.map((r) => ({
        contestantId: r.contestantId.toString(), number: r.number, name: r.name, total: r.total,
        groups: r.groups.map((d) => ({
          groupId: d.groupId.toString(), raw: d.raw, contribution: d.contribution, participants: d.participants,
        })),
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
