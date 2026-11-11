import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { getWxConfigFor, getWxGlobalConfig } from "@/lib/settings";
import { canAccess } from "@/lib/ownership";
import { canTransitionVoteStatus } from "@/lib/vote-lifecycle";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const vote = await db.vote.findUnique({
      where: { id: BigInt(params.id) },
      include: {
        rounds: {
          orderBy: { seq: "asc" },
          include: {
            groups: { orderBy: { sort: "asc" }, include: { scoreCriteria: { orderBy: { sort: "asc" } }, _count: { select: { voters: true, scoreEntries: true, voteEntries: true } } } },
            roundContestants: { select: { contestantId: true, batch: true, seq: true } },
          },
        },
        contestants: { orderBy: { sort: "asc" } },
      },
    });
    if (!vote || !canAccess(user, vote.ownerId)) return fail("投票不存在", 404);
    const wxEffective = await getWxConfigFor(vote);
    const wxGlobal = await getWxGlobalConfig();
    return ok({
      id: vote.id.toString(), name: vote.name, cover: vote.cover, description: vote.description,
      screenBgEnabled: vote.screenBgEnabled === 1, screenBgImage: vote.screenBgImage, screenBgDim: vote.screenBgDim,
      wxAppid: vote.wxAppid ?? "", wxSecret: vote.wxSecret ?? "", status: vote.status,
      wxEffective: wxEffective ? { source: wxEffective.source, sourceName: wxEffective.sourceName } : null,
      wxGlobalConfigured: !!(wxGlobal.appid && wxGlobal.secret),
      rounds: vote.rounds.map((r) => ({
        id: r.id.toString(), name: r.name, seq: r.seq, status: r.status, code: r.code,
        audienceStartAt: r.audienceStartAt, audienceEndAt: r.audienceEndAt,
        screenShowResult: r.screenShowResult, screenShowPart: r.screenShowPart, screenShowAxis: r.screenShowAxis, screenShowContribution: r.screenShowContribution, audienceShowResult: r.audienceShowResult,
        screenGroupId: r.screenGroupId?.toString() ?? null, screenQrMode: r.screenQrMode,
        screenPageSize: r.screenPageSize,
        screenSortMode: r.screenSortMode,
        currentBatch: r.currentBatch,
        contestantIds: r.roundContestants.map((rc) => rc.contestantId.toString()),
        contestantBatches: r.roundContestants.map((rc) => ({ contestantId: rc.contestantId.toString(), batch: rc.batch, seq: rc.seq })),
        groups: r.groups.map((g) => ({
          id: g.id.toString(), name: g.name, kind: g.kind, weight: Number(g.weight),
          maxScore: g.maxScore, maxVotes: g.maxVotes, allowRepeat: g.allowRepeat,
          fixedPoints: g.fixedPoints == null ? null : Number(g.fixedPoints),
          restricted: g.restricted, sort: g.sort, avgMode: g.avgMode, pctMode: g.pctMode, votePeriod: g.votePeriod,
          voteMode: g.voteMode,
          scoreMode: g.scoreMode,
          criteria: g.scoreCriteria.map((criterion) => ({ id: criterion.id.toString(), name: criterion.name, maxScore: Number(criterion.maxScore), weight: criterion.weight == null ? null : Number(criterion.weight), sort: criterion.sort })),
          scoreEntryCount: g._count.scoreEntries,
          voteEntryCount: g._count.voteEntries,
          voterCount: g._count.voters,
        })),
      })),
      contestants: vote.contestants.map((c) => ({
        id: c.id.toString(), number: c.number, name: c.name, intro: c.intro, image: c.image, sort: c.sort,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(500).optional(),
  cover: z.string().max(255).nullable().optional(),
  screenBgEnabled: z.boolean().optional(),
  screenBgImage: z.string().max(255).nullable().optional(),
  screenBgDim: z.number().int().min(60).max(90).optional(),
  wxAppid: z.string().max(64).nullable().optional(),
  wxSecret: z.string().max(128).nullable().optional(),
  status: z.enum(["draft", "active", "finished", "archived"]).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const voteId = BigInt(params.id);
    const vote = await db.vote.findUnique({ where: { id: voteId }, select: { ownerId: true, status: true } });
    if (!vote || !canAccess(user, vote.ownerId)) return fail("投票不存在", 404);
    const { screenBgEnabled, status, ...rest } = parsed.data;
    const data = { ...rest, ...(screenBgEnabled === undefined ? {} : { screenBgEnabled: screenBgEnabled ? 1 : 0 }) };
    if (status === undefined || status === vote.status) {
      await db.vote.update({ where: { id: voteId }, data: { ...data, ...(status === undefined ? {} : { status }) } });
      return ok(true);
    }
    if (!canTransitionVoteStatus(vote.status, status)) return fail("活动状态只能按彩排、正式、已结束、已归档顺序转换", 409);
    const failure = await db.$transaction(async (tx) => {
      const current = await tx.vote.findUnique({ where: { id: voteId }, select: { status: true, rounds: { select: { status: true } } } });
      if (!current) return fail("投票不存在", 404);
      if (current.status !== vote.status || !canTransitionVoteStatus(current.status, status)) return fail("活动状态已变更，请刷新后重试", 409);
      if (status === "active") {
        if (current.rounds.some((round) => round.status === "active")) return fail("请先暂停所有进行中轮次，再转为正式", 409);
        const [scoreCount, voteCount] = await Promise.all([
          tx.scoreEntry.count({ where: { group: { round: { voteId } } } }),
          tx.voteEntry.count({ where: { group: { round: { voteId } } } }),
        ]);
        if (scoreCount > 0 || voteCount > 0) return fail(`仍有彩排数据：评分 ${scoreCount} 条、投票 ${voteCount} 条，请先清空各轮彩排数据`, 409);
      }
      await tx.vote.update({ where: { id: voteId }, data: { ...data, status } });
      return null;
    });
    if (failure) return failure;
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const vote = await db.vote.findUnique({ where: { id: BigInt(params.id) }, select: { ownerId: true } });
    if (!vote || !canAccess(user, vote.ownerId)) return fail("投票不存在", 404);
    await db.vote.delete({ where: { id: BigInt(params.id) } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
