import { ok, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults } from "@/lib/scoring";

export async function GET(_req: Request, { params }: { params: { roundId: string } }) {
  try {
    const round = await db.voteRound.findUnique({
      where: { id: BigInt(params.roundId) },
      include: { vote: true, groups: { orderBy: { sort: "asc" } } },
    });
    if (!round) return ok(null);
    const results = await computeRoundResults(round.id);
    // 各群体参与情况（评分/限定群体：已交/总数；开放投票：参与人数）
    const participation = await Promise.all(round.groups.map(async (g) => {
      if (g.kind === "score" || g.restricted === 1) {
        const total = await db.voter.count({ where: { groupId: g.id } });
        const done = await db.voter.count({ where: { groupId: g.id, hasVoted: 1 } });
        return { groupId: g.id.toString(), done, total };
      }
      const rows: { c: bigint }[] = await db.$queryRaw`
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
      countdownEndsAt: round.countdownEndsAt,
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
