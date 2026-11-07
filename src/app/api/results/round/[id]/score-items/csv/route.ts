import { requireUser } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults, toCsv } from "@/lib/scoring";
import { canAccess, voteOwnerByRound } from "@/lib/ownership";
import { buildScoreItemDetails } from "@/lib/score-item-details";
import type { CriterionConfig, ScoreMode } from "@/lib/score-criteria";

const modeNames: Record<ScoreMode, string> = { single: "整体评分", sum: "分值分配", weighted: "百分制加权" };
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const roundId = BigInt(params.id);
    if (!canAccess(user, await voteOwnerByRound(roundId))) return new Response("not found", { status: 404 });
    const round = await db.voteRound.findUnique({
      where: { id: roundId },
      include: { vote: true, groups: { include: { scoreCriteria: { orderBy: { sort: "asc" } } }, orderBy: { sort: "asc" } } },
    });
    if (!round) return new Response("not found", { status: 404 });
    const [results, entries, contestants] = await Promise.all([
      computeRoundResults(roundId),
      db.scoreEntry.findMany({
        where: { group: { roundId } },
        include: { voter: { select: { name: true } }, scoreItems: true },
        orderBy: [{ contestantId: "asc" }, { groupId: "asc" }, { voterId: "asc" }],
      }),
      db.voteContestant.findMany({ where: { voteId: round.voteId }, select: { id: true, number: true, name: true } }),
    ]);
    const resultMap = new Map(results.map((result) => [result.contestantId.toString(), result]));
    const contestantMap = new Map(contestants.map((contestant) => [contestant.id.toString(), contestant]));
    const groupMap = new Map(round.groups.map((group) => [group.id.toString(), group]));
    const header = ["活动", "轮次", "选手编号", "选手姓名", "评审群体", "群体权重", "评分模式", "评委", "评分项", "该项满分", "该项比例", "该项原始分", "该项贡献", "评委合成总分", "个人折算分", "参评人数", "选手群体平均分", "群体折算分"];
    const rows: string[][] = [];

    for (const entry of entries) {
      const group = groupMap.get(entry.groupId.toString());
      const contestant = contestantMap.get(entry.contestantId.toString());
      if (!group || !contestant) continue;
      const mode = group.scoreMode as ScoreMode;
      const criteria: CriterionConfig[] = group.scoreCriteria.map((criterion) => ({
        id: criterion.id.toString(), name: criterion.name, maxScore: Number(criterion.maxScore),
        weight: criterion.weight == null ? null : Number(criterion.weight), sort: criterion.sort,
      }));
      const details = mode === "single" ? [{
        criterionId: "", name: "整体评分", maxScore: Number(group.maxScore), weight: null,
        score: Number(entry.score), contribution: null,
      }] : buildScoreItemDetails(mode, criteria, entry.scoreItems.map((item) => ({ criterionId: item.criterionId.toString(), score: Number(item.score) })));
      const groupResult = resultMap.get(entry.contestantId.toString())?.groups.find((item) => item.groupId === entry.groupId);
      const participants = groupResult?.participants ?? 0;
      const weight = Number(group.weight);
      const personalShare = participants > 0 ? round2(Number(entry.score) / participants * weight / 100) : 0;
      for (const detail of details) {
        rows.push([
          round.vote.name, round.name, contestant.number, contestant.name, group.name, String(weight), modeNames[mode], entry.voter.name,
          detail.name, String(detail.maxScore), detail.weight == null ? "" : String(detail.weight), detail.score == null ? "" : String(detail.score),
          detail.contribution == null ? "" : String(detail.contribution), String(Number(entry.score)), String(personalShare), String(participants),
          String(groupResult?.raw ?? 0), String(groupResult?.contribution ?? 0),
        ]);
      }
    }

    const csv = "\uFEFF" + toCsv([header, ...rows]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="round_${round.id}_score_items.csv"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export const dynamic = "force-dynamic";
