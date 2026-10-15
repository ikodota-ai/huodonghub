import { z } from "zod";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { fallbackVoterKey, clientIp } from "@/lib/fingerprint";
import { publish, screenChannel } from "@/lib/sse";
import { wxOpenidFromCookies } from "@/lib/wx-openid";
import { getWxConfigFor } from "@/lib/settings";

type Ctx = { params: { token: string } };

async function loadVoter(token: string) {
  return db.voter.findUnique({
    where: { token },
    include: {
      group: {
        include: {
          round: {
            include: {
              vote: true,
              roundContestants: { include: { contestant: { select: { id: true, number: true, name: true, intro: true, image: true } } }, orderBy: { contestant: { sort: "asc" } } },
            },
          },
        },
      },
    },
  });
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const voter = await loadVoter(params.token);
    if (!voter) return fail("评分码无效", 404);
    const { group } = voter;
    const { round } = group;
    const wxConfigured = !!(await getWxConfigFor(round.vote));
    const bound = !!voter.boundKey;
    const batchOf = new Map(round.roundContestants.map((rc) => [rc.contestantId.toString(), rc.batch]));
    const batches = [...new Set(round.roundContestants.map((rc) => rc.batch).filter((b) => b > 0))].sort((a, b) => a - b);
    const currentBatch = round.currentBatch;
    // 当前批次作用域：currentBatch=0 → 全员（旧行为）；N → 仅第 N 批选手
    const inScope = (cid: string) => currentBatch === 0 || (batchOf.get(cid) ?? 0) === currentBatch;
    // 已提交明细（含批次归属，用于回显与"每批可提交一次"的判定）
    let submitted: { contestantId: string; score: number | null }[] = [];
    let submittedBatches: number[] = [];
    if (voter.hasVoted === 1) {
      if (group.kind === "score") {
        const entries = await db.scoreEntry.findMany({ where: { groupId: group.id, voterId: voter.id } });
        submittedBatches = [...new Set(entries.map((e) => batchOf.get(e.contestantId.toString()) ?? 0))];
        submitted = entries.filter((e) => inScope(e.contestantId.toString())).map((e) => ({ contestantId: e.contestantId.toString(), score: Number(e.score) }));
      } else {
        const entries = await db.voteEntry.findMany({ where: { groupId: group.id, voterKey: `voter_${voter.id}` } });
        submittedBatches = [...new Set(entries.map((e) => batchOf.get(e.contestantId.toString()) ?? 0))];
        submitted = entries.filter((e) => inScope(e.contestantId.toString())).map((e) => ({ contestantId: e.contestantId.toString(), score: null }));
      }
    }
    // 批次提交判定：全员模式（currentBatch=0）任何提交即锁定；分批模式按批次判定
    const currentBatchSubmitted = currentBatch === 0 ? voter.hasVoted === 1 : submittedBatches.includes(currentBatch);
    return ok({
      voteId: round.vote.id.toString(),
      voteName: round.vote.name,
      roundName: round.name,
      roundStatus: round.status,
      groupName: group.name,
      kind: group.kind,
      maxScore: group.maxScore,
      maxVotes: group.maxVotes,
      allowRepeat: group.allowRepeat,
      voterName: voter.name,
      needBind: voter.needBind === 1 && !bound,
      wxConfigured,
      hasVoted: voter.hasVoted === 1,
      currentBatch,
      batches,
      submittedBatches,
      currentBatchSubmitted,
      submitted,
      contestants: round.roundContestants
        .filter((rc) => inScope(rc.contestant.id.toString()))
        .sort((a, b) => (a.seq - b.seq) || 0)
        .map((rc) => ({
          id: rc.contestant.id.toString(),
          number: rc.contestant.number,
          name: rc.contestant.name,
          intro: rc.contestant.intro,
          image: rc.contestant.image,
        })),
    });
  } catch (e) {
    return handleError(e);
  }
}

const submitSchema = z.object({
  scores: z.array(z.object({ contestantId: z.coerce.bigint(), score: z.number().min(0) })).optional(),
  contestantIds: z.array(z.coerce.bigint()).optional(),
  fp: z.string().max(128).optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    const voter = await loadVoter(params.token);
    if (!voter) return fail("评分码无效", 404);
    const { group } = voter;
    const { round } = group;
    if (round.status !== "active") return fail("当前轮次不在评分时间", 403);

    const parsed = submitSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");

    // 身份绑定校验：openid（cookie）或设备指纹与绑定值比对
    if (voter.needBind === 1) {
      if (!voter.boundKey) return fail("请先完成微信绑定", 403);
      const openid = await wxOpenidFromCookies(round.voteId);
      const identity = openid || (parsed.data.fp ? fallbackVoterKey(parsed.data.fp) : null);
      if (identity && identity !== voter.boundKey) return fail("此评分码已绑定其他微信/设备（如更换设备请联系工作人员重置）", 403);
    }
    // 当前批次作用域：只允许为当前批次选手评分/投票；每批限提交一次
    const currentBatch = round.currentBatch;
    const scopeContestants = round.roundContestants.filter((rc) => currentBatch === 0 || rc.batch === currentBatch);
    const allowed = new Set(scopeContestants.map((rc) => rc.contestantId.toString()));
    const scopeIds = scopeContestants.map((rc) => rc.contestantId);
    if (group.kind === "score") {
      const dup = await db.scoreEntry.findFirst({ where: { groupId: group.id, voterId: voter.id, contestantId: { in: scopeIds } } });
      if (dup) return fail(currentBatch > 0 ? `第 ${currentBatch} 批已提交过，不可重复提交` : "您已提交过，不可重复提交", 403);
    } else {
      const dup = await db.voteEntry.findFirst({ where: { groupId: group.id, voterKey: `voter_${voter.id}`, contestantId: { in: scopeIds } } });
      if (dup) return fail(currentBatch > 0 ? `第 ${currentBatch} 批已提交过，不可重复提交` : "您已提交过，不可重复提交", 403);
    }

    if (group.kind === "score") {
      const scores = parsed.data.scores ?? [];
      if (scores.length === 0) return fail("请为选手打分");
      for (const s of scores) {
        if (!allowed.has(s.contestantId.toString())) return fail("存在无效选手");
        if (s.score > group.maxScore) return fail(`分数不能超过 ${group.maxScore}`);
      }
      await db.$transaction(async (tx) => {
        for (const s of scores) {
          await tx.scoreEntry.create({
            data: { groupId: group.id, voterId: voter.id, contestantId: s.contestantId, score: s.score },
          });
          await tx.groupStat.upsert({
            where: { groupId_contestantId: { groupId: group.id, contestantId: s.contestantId } },
            update: { valueCache: { increment: s.score } },
            create: { groupId: group.id, contestantId: s.contestantId, valueCache: s.score },
          });
        }
        await tx.voter.update({ where: { id: voter.id }, data: { hasVoted: 1, votedAt: new Date() } });
      });
    } else {
      const picks = parsed.data.contestantIds ?? [];
      if (picks.length === 0) return fail("请选择选手");
      if (picks.length > group.maxVotes) return fail(`最多选择 ${group.maxVotes} 位选手`);
      if (group.allowRepeat !== 1 && new Set(picks.map(String)).size !== picks.length) return fail("不可重复选择同一选手");
      for (const pid of picks) if (!allowed.has(pid.toString())) return fail("存在无效选手");
      await db.$transaction(async (tx) => {
        for (const contestantId of picks) {
          await tx.voteEntry.create({
            data: { groupId: group.id, contestantId, voterKey: `voter_${voter.id}`, ip: clientIp() },
          });
          await tx.groupStat.upsert({
            where: { groupId_contestantId: { groupId: group.id, contestantId } },
            update: { valueCache: { increment: 1 } },
            create: { groupId: group.id, contestantId, valueCache: 1 },
          });
        }
        await tx.voter.update({ where: { id: voter.id }, data: { hasVoted: 1, votedAt: new Date() } });
      });
    }

    publish(screenChannel(round.id.toString()), "update", { reason: "judge_vote" });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
