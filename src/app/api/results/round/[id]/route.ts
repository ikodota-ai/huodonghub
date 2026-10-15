import { requireUser } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults } from "@/lib/scoring";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const round = await db.voteRound.findUnique({ where: { id: BigInt(params.id) }, include: { vote: true, groups: { orderBy: { sort: "asc" } } } });
    if (!round) return ok(null);
    const results = await computeRoundResults(round.id);
    const batchMode = results.some((r) => r.batch > 0);
    return ok({
      voteName: round.vote.name, roundName: round.name, status: round.status,
      batchMode,
      groups: round.groups.map((g) => ({ id: g.id.toString(), name: g.name, kind: g.kind, weight: Number(g.weight) })),
      results: results.map((r, i) => ({
        rank: i + 1, contestantId: r.contestantId.toString(), number: r.number, name: r.name, total: r.total,
        batch: r.batch,
        groups: r.groups.map((d) => ({ groupId: d.groupId.toString(), name: d.groupName, kind: d.kind, weight: d.weight, raw: d.raw, contribution: d.contribution, participants: d.participants })),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
