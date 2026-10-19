import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults } from "@/lib/scoring";
import { canAccess } from "@/lib/ownership";

type Ctx = { params: { id: string; contestantId: string } };

// 选手跨轮成绩单：该选手在每一轮各评审群体的具体分数（原始值 + 折算分）。
// 用于跨轮聚合页展开行；?rounds=1,2,3 与聚合勾选轮次保持一致，缺省全部轮次。
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const vote = await db.vote.findUnique({ where: { id: BigInt(params.id) } });
    if (!vote || !canAccess(user, vote.ownerId)) return fail("投票不存在", 404);
    const contestant = await db.voteContestant.findFirst({ where: { id: BigInt(params.contestantId), voteId: vote.id } });
    if (!contestant) return fail("选手不存在", 404);
    const roundsParam = new URL(req.url).searchParams.get("rounds");
    const roundFilter = roundsParam ? new Set(roundsParam.split(",").map((s) => s.trim()).filter(Boolean)) : null;
    const rounds = await db.voteRound.findMany({
      where: { voteId: vote.id },
      orderBy: { seq: "asc" },
      include: { roundContestants: { select: { contestantId: true } } },
    });
    const out = [];
    for (const round of rounds) {
      if (roundFilter && !roundFilter.has(round.id.toString())) continue;
      const inRoster = round.roundContestants.some((rc) => rc.contestantId === contestant.id);
      if (!inRoster) {
        out.push({ roundId: round.id.toString(), roundName: round.name, participated: false, batch: 0, total: null, groups: [] });
        continue;
      }
      const results = await computeRoundResults(round.id);
      const r = results.find((x) => x.contestantId === contestant.id);
      // 评分群体逐评委明细：该评委折算 = 打分 ÷ 参评人数 × 权重%，逐人合计恰为群体折算分
      // （参评人数口径随 avgMode：实际评分人数或全体评委人数，两种口径下等式均成立）
      const scoreEntries = await db.scoreEntry.findMany({
        where: { contestantId: contestant.id, group: { roundId: round.id } },
        include: { voter: { select: { name: true } } },
        orderBy: [{ groupId: "asc" }, { score: "desc" }],
      });
      const judgesByGroup = new Map<string, { name: string; score: number }[]>();
      for (const e of scoreEntries) {
        const k = e.groupId.toString();
        if (!judgesByGroup.has(k)) judgesByGroup.set(k, []);
        judgesByGroup.get(k)!.push({ name: e.voter.name, score: Number(e.score) });
      }
      out.push({
        roundId: round.id.toString(),
        roundName: round.name,
        participated: true,
        batch: r?.batch ?? 0,
        total: r?.total ?? 0,
        groups: (r?.groups ?? []).map((d) => ({
          name: d.groupName, kind: d.kind, weight: d.weight,
          raw: d.raw, contribution: d.contribution, participants: d.participants,
          fixedPoints: d.fixedPoints,
          judges: d.kind !== "score" ? [] : (judgesByGroup.get(d.groupId.toString()) ?? []).map((j) => ({
            ...j,
            share: d.participants > 0 ? Math.round(((j.score / d.participants) * (d.weight / 100)) * 100) / 100 : 0,
          })),
        })),
      });
    }
    return ok({
      contestant: { id: contestant.id.toString(), number: contestant.number, name: contestant.name, image: contestant.image },
      rounds: out,
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
