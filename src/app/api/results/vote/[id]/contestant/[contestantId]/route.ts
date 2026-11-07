import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults } from "@/lib/scoring";
import { canAccess } from "@/lib/ownership";
import { buildScoreItemDetails } from "@/lib/score-item-details";
import type { CriterionConfig, ScoreMode } from "@/lib/score-criteria";

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
      const scoreGroups = await db.voteGroup.findMany({
        where: { roundId: round.id, kind: "score" },
        include: { scoreCriteria: { orderBy: { sort: "asc" } } },
      });
      const scoreGroupMap = new Map(scoreGroups.map((group) => [group.id.toString(), {
        mode: group.scoreMode as ScoreMode,
        criteria: group.scoreCriteria.map((criterion): CriterionConfig => ({
          id: criterion.id.toString(), name: criterion.name, maxScore: Number(criterion.maxScore),
          weight: criterion.weight == null ? null : Number(criterion.weight), sort: criterion.sort,
        })),
      }]));
      // 评分群体逐评委明细：该评委折算 = 打分 ÷ 参评人数 × 权重%，逐人合计恰为群体折算分
      // （参评人数口径随 avgMode：实际评分人数或全体评委人数，两种口径下等式均成立）
      const scoreEntries = await db.scoreEntry.findMany({
        where: { contestantId: contestant.id, group: { roundId: round.id } },
        include: { voter: { select: { name: true } }, scoreItems: true },
        orderBy: [{ groupId: "asc" }, { score: "desc" }],
      });
      const judgesByGroup = new Map<string, { name: string; score: number; items: ReturnType<typeof buildScoreItemDetails> }[]>();
      for (const e of scoreEntries) {
        const k = e.groupId.toString();
        if (!judgesByGroup.has(k)) judgesByGroup.set(k, []);
        const config = scoreGroupMap.get(k) ?? { mode: "single" as ScoreMode, criteria: [] };
        judgesByGroup.get(k)!.push({
          name: e.voter.name,
          score: Number(e.score),
          items: buildScoreItemDetails(config.mode, config.criteria, e.scoreItems.map((item) => ({ criterionId: item.criterionId.toString(), score: Number(item.score) }))),
        });
      }
      out.push({
        roundId: round.id.toString(),
        roundName: round.name,
        participated: true,
        batch: r?.batch ?? 0,
        total: r?.total ?? 0,
        groups: (r?.groups ?? []).map((d) => {
          const config = scoreGroupMap.get(d.groupId.toString()) ?? { mode: "single" as ScoreMode, criteria: [] };
          const judges = d.kind !== "score" ? [] : (judgesByGroup.get(d.groupId.toString()) ?? []).map((judge) => ({
            ...judge,
            share: d.participants > 0 ? Math.round(((judge.score / d.participants) * (d.weight / 100)) * 100) / 100 : 0,
          }));
          const criteria = config.mode === "single" ? [] : config.criteria.map((criterion) => {
            const itemRows = judges.map((judge) => judge.items.find((item) => item.criterionId === criterion.id)).filter((item) => item?.score != null);
            const average = (values: number[]) => values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
            return {
              ...criterion,
              averageScore: average(itemRows.map((item) => item!.score!)),
              averageContribution: average(itemRows.map((item) => item!.contribution).filter((value): value is number => value != null)),
            };
          });
          return {
            groupId: d.groupId.toString(),
            name: d.groupName, kind: d.kind, weight: d.weight,
            raw: d.raw, contribution: d.contribution, participants: d.participants,
            fixedPoints: d.fixedPoints,
            rate: d.rate, voteMode: d.voteMode,
            scoreMode: config.mode,
            criteria,
            judges,
          };
        }),
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
