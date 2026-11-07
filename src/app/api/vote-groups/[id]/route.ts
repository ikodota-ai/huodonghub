import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { canAccess, voteOwnerByGroup } from "@/lib/ownership";
import { ScoreMode, validateCriteria } from "@/lib/score-criteria";
import { isRoundDraft } from "@/lib/round-lifecycle";

type Ctx = { params: { id: string } };

const criterionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(64),
  maxScore: z.number().int().positive().default(100),
  weight: z.number().positive().max(100).nullable().default(null),
  sort: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  kind: z.enum(["score", "vote"]).optional(),
  weight: z.number().min(0).max(100).optional(),
  maxScore: z.number().int().min(1).max(10000).optional(),
  maxVotes: z.number().int().min(1).max(100).optional(),
  allowRepeat: z.number().int().min(0).max(1).optional(),
  fixedPoints: z.number().positive().nullable().optional(),
  restricted: z.number().int().min(0).max(1).optional(),
  sort: z.number().int().optional(),
  avgMode: z.enum(["scorers", "roster"]).optional(),
  pctMode: z.enum(["batch", "round"]).optional(),
  votePeriod: z.enum(["total", "daily"]).optional(),
  voteMode: z.enum(["participants", "top", "share"]).optional(),
  scoreMode: z.enum(["single", "sum", "weighted"]).optional(),
  criteria: z.array(criterionSchema).optional(),
});

function comparableCriteria(criteria: { id?: string; name: string; maxScore: number; weight: number | null; sort?: number }[]) {
  return criteria.map((item, index) => ({ ...item, id: item.id ?? `new-${index + 1}`, sort: item.sort ?? index + 1 }));
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!canAccess(user, await voteOwnerByGroup(BigInt(params.id)))) return fail("群体不存在", 404);
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const groupId = BigInt(params.id);
    const existing = await db.voteGroup.findUnique({
      where: { id: groupId },
      include: { scoreCriteria: { orderBy: { sort: "asc" } }, round: { select: { status: true } }, _count: { select: { scoreEntries: true } } },
    });
    if (!existing) return fail("群体不存在", 404);
    const d = parsed.data;
    const nextKind = d.kind ?? existing.kind;
    const nextMaxScore = d.maxScore ?? existing.maxScore;
    const nextMode: ScoreMode = nextKind === "vote" ? "single" : (d.scoreMode ?? existing.scoreMode as ScoreMode);
    if (nextKind === "vote" && ((d.scoreMode && d.scoreMode !== "single") || (d.criteria && d.criteria.length > 0))) return fail("投票群体不能配置评分项");
    const storedCriteria = existing.scoreCriteria.map((item) => ({ id: item.id.toString(), name: item.name, maxScore: Number(item.maxScore), weight: item.weight == null ? null : Number(item.weight), sort: item.sort }));
    const nextCriteria = comparableCriteria((d.criteria ?? storedCriteria).map((item) => ({ ...item, maxScore: item.maxScore, weight: item.weight })));
    const configError = nextKind === "score" ? validateCriteria(nextMode, nextMaxScore, nextCriteria) : null;
    if (configError) return fail(configError);
    const sameCriteria = JSON.stringify(nextCriteria.map(({ name, maxScore, weight, sort }) => ({ name, maxScore, weight, sort })))
      === JSON.stringify(storedCriteria.map(({ name, maxScore, weight, sort }) => ({ name, maxScore, weight, sort })));
    const ruleChanged = nextKind !== existing.kind || nextMaxScore !== existing.maxScore || nextMode !== existing.scoreMode || !sameCriteria;
    if (existing.round && !isRoundDraft(existing.round.status) && ruleChanged) return fail("轮次已开始，评分规则已锁定；请新建轮次使用新规则", 409);
    if (existing._count.scoreEntries > 0 && ruleChanged) return fail("已有评分数据，清空该群体成绩后才能修改评分规则", 409);
    const replaceCriteria = existing._count.scoreEntries === 0 && (d.criteria !== undefined || (nextMode === "single" && existing.scoreCriteria.length > 0) || nextKind === "vote");
    const { criteria: ignoredCriteria, scoreMode: ignoredMode, ...fields } = d;
    void ignoredCriteria;
    void ignoredMode;
    await db.$transaction(async (tx) => {
      await tx.voteGroup.update({ where: { id: groupId }, data: { ...fields, kind: nextKind, maxScore: nextMaxScore, scoreMode: nextMode } });
      if (replaceCriteria) {
        await tx.scoreCriterion.deleteMany({ where: { groupId } });
        if (nextKind === "score" && nextMode !== "single") {
          await tx.scoreCriterion.createMany({
            data: nextCriteria.map((item) => ({ groupId, name: item.name, maxScore: item.maxScore, weight: item.weight, sort: item.sort })),
          });
        }
      }
    });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!canAccess(user, await voteOwnerByGroup(BigInt(params.id)))) return fail("群体不存在", 404);
    const group = await db.voteGroup.findUnique({
      where: { id: BigInt(params.id) },
      select: { id: true, round: { select: { status: true } }, _count: { select: { scoreEntries: true, voteEntries: true } } },
    });
    if (!group) return fail("群体不存在", 404);
    if (!isRoundDraft(group.round.status) && (group._count.scoreEntries > 0 || group._count.voteEntries > 0)) {
      return fail("轮次已开始，不能删除已有评分或投票的群体", 409);
    }
    await db.voteGroup.delete({ where: { id: group.id } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
