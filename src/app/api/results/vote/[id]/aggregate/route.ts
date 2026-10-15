import { requireUser } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeVoteAggregate } from "@/lib/scoring";
import { canAccess } from "@/lib/ownership";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const vote = await db.vote.findUnique({ where: { id: BigInt(params.id) } });
    if (!vote || !canAccess(user, vote.ownerId)) return ok(null);
    // ?rounds=1,2,3 勾选参与聚合的轮次，缺省为全部轮次
    const roundsParam = new URL(req.url).searchParams.get("rounds");
    const roundIds = roundsParam
      ? roundsParam.split(",").map((s) => s.trim()).filter(Boolean).map((s) => BigInt(s))
      : undefined;
    const agg = await computeVoteAggregate(vote.id, roundIds);
    return ok({
      voteName: vote.name,
      rounds: agg.rounds,
      roundCount: agg.roundCount,
      contestantCount: agg.contestantCount,
      maxTotal: agg.maxTotal,
      avgTotal: agg.avgTotal,
      list: agg.list.map((item, i) => ({
        rank: i + 1,
        contestantId: item.contestantId.toString(),
        number: item.number,
        name: item.name,
        intro: item.intro,
        image: item.image,
        total: item.total,
        groups: item.groups.map((g) => ({
          key: g.key,
          name: g.name,
          kind: g.kind,
          weight: g.weight,
          scoreAvg: g.scoreAvg,
          votes: g.votes,
          votePct: g.votePct,
          fixedPoints: g.fixedPoints,
          contribution: g.contribution,
        })),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
