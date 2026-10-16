import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults } from "@/lib/scoring";

// 观众端结果（公开）：仅当现场导播在轮次设置中打开「观众端开放结果查看」后可见，
// 未开放时按不存在处理（404），避免通过猜测 code 泄露比分。
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  try {
    const round = await db.voteRound.findUnique({
      where: { code: params.code },
      include: { vote: true, groups: { orderBy: { sort: "asc" } } },
    });
    if (!round) return fail("投票链接无效", 404);
    if (round.audienceShowResult !== 1) return fail("结果暂未公布", 404);
    const results = await computeRoundResults(round.id);
    return ok({
      voteName: round.vote.name,
      cover: round.vote.cover,
      roundName: round.name,
      status: round.status,
      batchMode: results.some((r) => r.batch > 0),
      groups: round.groups.map((g) => ({ id: g.id.toString(), name: g.name, kind: g.kind, weight: Number(g.weight) })),
      results: results.map((r, i) => ({
        rank: i + 1,
        number: r.number,
        name: r.name,
        image: r.image,
        total: r.total,
        batch: r.batch,
        groups: r.groups.map((d) => ({
          groupId: d.groupId.toString(), name: d.groupName, kind: d.kind,
          raw: d.raw, contribution: d.contribution,
        })),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
