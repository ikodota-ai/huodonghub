import { z } from "zod";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { fallbackVoterKey, clientIp } from "@/lib/fingerprint";
import { publish, screenChannel } from "@/lib/sse";
import { wxOpenidFromCookies } from "@/lib/wx-openid";
import { getSetting, getWxConfigFor } from "@/lib/settings";
import { chinaDayStart } from "@/lib/day";

type Ctx = { params: { code: string } };

// 同 IP 软限流：默认每群体每 IP 10 分钟 60 票（可在 settings 表 vote.ipLimit 覆盖：{"windowMin":10,"max":60}）
// 注意不能收太紧：活动现场同 WiFi 出口 NAT 下数百观众共享一个公网 IP
async function ipThrottleHit(groupId: bigint, ip: string): Promise<boolean> {
  let windowMin = 10, max = 60;
  try {
    const raw = await getSetting("vote.ipLimit");
    if (raw) { const j = JSON.parse(raw); if (j.windowMin > 0) windowMin = j.windowMin; if (j.max > 0) max = j.max; }
  } catch {}
  const since = new Date(Date.now() - windowMin * 60 * 1000);
  const count = await db.voteEntry.count({ where: { groupId, ip, createdAt: { gte: since } } });
  return count >= max;
}

async function loadRound(code: string) {
  return db.voteRound.findUnique({
    where: { code },
    include: {
      vote: true,
      groups: { where: { kind: "vote", restricted: 0 }, orderBy: { sort: "asc" } },
      roundContestants: { include: { contestant: { select: { id: true, number: true, name: true, intro: true, image: true } } }, orderBy: { contestant: { sort: "asc" } } },
    },
  });
}

function roundPhase(round: { status: string; audienceStartAt: Date | null; audienceEndAt: Date | null }): string {
  if (round.status !== "active") return round.status; // pending/paused/finished
  const now = new Date();
  if (round.audienceStartAt && now < round.audienceStartAt) return "pending";
  if (round.audienceEndAt && now > round.audienceEndAt) return "finished";
  return "active";
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const round = await loadRound(params.code);
    if (!round) return fail("投票链接无效", 404);
    const group = round.groups[0] ?? null;
    const batchOf = new Map(round.roundContestants.map((rc) => [rc.contestantId.toString(), rc.batch]));
    const batches = [...new Set(round.roundContestants.map((rc) => rc.batch).filter((b) => b > 0))].sort((a, b) => a - b);
    const currentBatch = round.currentBatch;
    const inScope = (cid: string) => currentBatch === 0 || (batchOf.get(cid) ?? 0) === currentBatch;
    const fp = new URL(req.url).searchParams.get("fp") || "";
    const openid = await wxOpenidFromCookies(round.voteId);
    const voterKey = openid || (fp ? fallbackVoterKey(fp) : null);
    // 票数配额按当前批次独立计算：每批每人 maxVotes 票
    let used = 0;
    let votedContestantIds: string[] = [];
    if (group && voterKey) {
      // 限票周期：daily=只统计今天的票（东八区日历日），total=累计全部
      const dayStart = group.votePeriod === "daily" ? chinaDayStart() : null;
      const entries = await db.voteEntry.findMany({ where: { groupId: group.id, voterKey } });
      const scoped = entries.filter((e) => inScope(e.contestantId.toString()) && (!dayStart || e.createdAt >= dayStart));
      used = scoped.length;
      votedContestantIds = scoped.map((e) => e.contestantId.toString());
    }
    return ok({
      voteId: round.voteId.toString(),
      voteName: round.vote.name,
      cover: round.vote.cover,
      roundName: round.name,
      currentBatch,
      batches,
      phase: roundPhase(round),
      countdownEndsAt: round.countdownEndsAt,
      audienceShowResult: round.audienceShowResult === 1,
      wxConfigured: !!(await getWxConfigFor(round.vote)),
      identified: !!openid,
      group: group ? {
        id: group.id.toString(), maxVotes: group.maxVotes, votePeriod: group.votePeriod,
        allowRepeat: group.allowRepeat === 1, used, votedContestantIds,
      } : null,
      contestants: round.roundContestants
        .filter((rc) => inScope(rc.contestant.id.toString()))
        .sort((a, b) => a.seq - b.seq)
        .map((rc) => ({
          id: rc.contestant.id.toString(), number: rc.contestant.number,
          name: rc.contestant.name, intro: rc.contestant.intro, image: rc.contestant.image,
        })),
    });
  } catch (e) {
    return handleError(e);
  }
}

const castSchema = z.object({ contestantId: z.coerce.bigint(), fp: z.string().max(128).optional() });

export async function POST(req: Request, { params }: Ctx) {
  try {
    const round = await loadRound(params.code);
    if (!round) return fail("投票链接无效", 404);
    if (roundPhase(round) !== "active") return fail("当前不在投票时间", 403);
    const group = round.groups[0];
    if (!group) return fail("本轮未开放观众投票", 403);

    const parsed = castSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const openid = await wxOpenidFromCookies(round.voteId);
    const voterKey = openid || (parsed.data.fp ? fallbackVoterKey(parsed.data.fp) : null);
    if (!voterKey) return fail("无法确定身份，请刷新重试", 403);

    // 当前批次作用域：只能为当前批次选手投票，配额按批次独立计算
    const currentBatch = round.currentBatch;
    const scopeContestants = round.roundContestants.filter((rc) => currentBatch === 0 || rc.batch === currentBatch);
    const contestantId = parsed.data.contestantId;
    const allowed = new Set(scopeContestants.map((rc) => rc.contestantId.toString()));
    if (!allowed.has(contestantId.toString())) return fail(currentBatch > 0 ? "该选手不在当前投票批次" : "选手无效");

    const ip = clientIp();
    if (await ipThrottleHit(group.id, ip)) return fail("当前网络投票过于频繁，请稍后再试", 429);

    const scopeIds = new Set(scopeContestants.map((rc) => rc.contestantId.toString()));
    // 限票周期：daily=只统计今天的票（跨天自动重置配额与"不可重复投同一选手"）
    const dayStart = group.votePeriod === "daily" ? chinaDayStart() : null;
    const allEntries = await db.voteEntry.findMany({ where: { groupId: group.id, voterKey } });
    const usedEntries = allEntries.filter((e) => scopeIds.has(e.contestantId.toString()) && (!dayStart || e.createdAt >= dayStart));
    if (usedEntries.length >= group.maxVotes) {
      return fail(group.votePeriod === "daily"
        ? (currentBatch > 0 ? "您本批今天的票数已用完" : "您今天的票数已用完，明天可继续投")
        : (currentBatch > 0 ? "您本批的票数已用完" : "您的票数已用完"), 403);
    }
    if (group.allowRepeat !== 1 && usedEntries.some((e) => e.contestantId === contestantId)) {
      return fail("不可重复投同一选手", 403);
    }

    await db.$transaction([
      db.voteEntry.create({ data: { groupId: group.id, contestantId, voterKey, ip } }),
      db.groupStat.upsert({
        where: { groupId_contestantId: { groupId: group.id, contestantId } },
        update: { valueCache: { increment: 1 } },
        create: { groupId: group.id, contestantId, valueCache: 1 },
      }),
    ]);
    publish(screenChannel(round.id.toString()), "update", { reason: "audience_vote" });
    return ok({ used: usedEntries.length + 1, remaining: group.maxVotes - usedEntries.length - 1 });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
