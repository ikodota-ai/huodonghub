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
    // 已提交时回显其打分/投票明细（评委常要求确认）
    let submitted: { contestantId: string; score: number | null }[] = [];
    if (voter.hasVoted === 1) {
      if (group.kind === "score") {
        const entries = await db.scoreEntry.findMany({ where: { groupId: group.id, voterId: voter.id } });
        submitted = entries.map((e) => ({ contestantId: e.contestantId.toString(), score: Number(e.score) }));
      } else {
        const entries = await db.voteEntry.findMany({ where: { groupId: group.id, voterKey: `voter_${voter.id}` } });
        submitted = entries.map((e) => ({ contestantId: e.contestantId.toString(), score: null }));
      }
    }
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
      submitted,
      contestants: round.roundContestants.map((rc) => ({
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
    if (voter.hasVoted === 1) return fail("您已提交过，不可重复提交", 403);

    const parsed = submitSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");

    // 身份绑定校验：openid（cookie）或设备指纹与绑定值比对
    if (voter.needBind === 1) {
      if (!voter.boundKey) return fail("请先完成微信绑定", 403);
      const openid = await wxOpenidFromCookies(round.voteId);
      const identity = openid || (parsed.data.fp ? fallbackVoterKey(parsed.data.fp) : null);
      if (identity && identity !== voter.boundKey) return fail("此评分码已绑定其他微信", 403);
    }
    const allowed = new Set(round.roundContestants.map((rc) => rc.contestantId.toString()));

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
