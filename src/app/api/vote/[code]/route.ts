import { z } from "zod";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { fallbackVoterKey, clientIp } from "@/lib/fingerprint";
import { publish, screenChannel } from "@/lib/sse";
import { wxOpenidFromCookies } from "@/lib/wx-openid";
import { getSetting, getWxConfigFor } from "@/lib/settings";
import { chinaDayStart } from "@/lib/day";
import { voteAcceptsSubmissions } from "@/lib/vote-lifecycle";

type Ctx = { params: { code: string } };

// 同 IP 软限流：默认每群体每 IP 10 分钟 60 票（可在 settings 表 vote.ipLimit 覆盖：{"windowMin":10,"max":60}）
// 注意不能收太紧：活动现场同 WiFi 出口 NAT 下数百观众共享一个公网 IP
async function ipThrottleConfig(): Promise<{ windowMin: number; max: number }> {
  let windowMin = 10, max = 60;
  try {
    const raw = await getSetting("vote.ipLimit");
    if (raw) { const j = JSON.parse(raw); if (j.windowMin > 0) windowMin = j.windowMin; if (j.max > 0) max = j.max; }
  } catch {}
  return { windowMin, max };
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
    const group = round.groups.find((item) => item.id === round.screenGroupId) ?? null;
    const phase = roundPhase(round);
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
      voteStatus: round.vote.status,
      cover: round.vote.cover,
      roundName: round.name,
      currentBatch,
      batches,
      phase: phase === "active" && !group ? "paused" : phase,
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

type PostContext = {
  round_id: bigint;
  vote_id: bigint;
  vote_status: string;
  status: string;
  audience_start_at: Date | null;
  audience_end_at: Date | null;
  current_batch: number;
  group_id: bigint | null;
  max_votes: number | null;
  allow_repeat: number | null;
  vote_period: string | null;
  contestant_batch: number | null;
};

type PostPrecheckRow = {
  row_type: "entry" | "throttle";
  contestant_id: bigint | null;
  created_at: Date | null;
  ip_count: bigint | number | null;
};

export async function POST(req: Request, { params }: Ctx) {
  try {
    const parsed = castSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const contestantId = parsed.data.contestantId;
    const rows = await db.$queryRaw<PostContext[]>`
      SELECT r.id AS round_id, r.vote_id, v.status AS vote_status, r.status, r.audience_start_at, r.audience_end_at, r.current_batch,
        g.id AS group_id, g.max_votes, g.allow_repeat, g.vote_period, rc.batch AS contestant_batch
      FROM vote_rounds r
      JOIN votes v ON v.id = r.vote_id
      LEFT JOIN vote_groups g ON g.round_id = r.id AND g.kind = 'vote' AND g.restricted = 0
        AND g.id = r.screen_group_id
      LEFT JOIN round_contestants rc ON rc.round_id = r.id AND rc.contestant_id = ${contestantId}
      WHERE r.code = ${params.code}
      ORDER BY g.sort ASC
      LIMIT 1
    `;
    const context = rows[0];
    if (!context) return fail("投票链接无效", 404);
    if (!voteAcceptsSubmissions(context.vote_status)) {
      return fail(context.vote_status === "archived" ? "活动已归档，禁止继续投票" : "活动已结束，禁止继续投票", 403);
    }
    if (roundPhase({ status: context.status, audienceStartAt: context.audience_start_at, audienceEndAt: context.audience_end_at }) !== "active") {
      return fail("当前不在投票时间", 403);
    }
    if (context.group_id === null) return fail("本轮未开放观众投票", 403);
    const group = {
      id: context.group_id,
      maxVotes: context.max_votes!,
      allowRepeat: context.allow_repeat!,
      votePeriod: context.vote_period!,
    };

    const openid = await wxOpenidFromCookies(context.vote_id);
    const voterKey = openid || (parsed.data.fp ? fallbackVoterKey(parsed.data.fp) : null);
    if (!voterKey) return fail("无法确定身份，请刷新重试", 403);

    const currentBatch = context.current_batch;
    if (context.contestant_batch === null || (currentBatch > 0 && context.contestant_batch !== currentBatch)) {
      return fail(currentBatch > 0 ? "该选手不在当前投票批次" : "选手无效");
    }

    const ip = clientIp();
    const throttle = await ipThrottleConfig();
    const throttleSince = new Date(Date.now() - throttle.windowMin * 60 * 1000);

    // 限票周期：daily=只统计今天的票（跨天自动重置配额与"不可重复投同一选手"）
    const dayStart = group.votePeriod === "daily" ? chinaDayStart() : null;
    const precheckRows: PostPrecheckRow[] = currentBatch > 0
      ? await db.$queryRaw`
        SELECT 'entry' AS row_type, ve.contestant_id, ve.created_at, NULL AS ip_count
        FROM vote_entries ve
        JOIN round_contestants rc ON rc.round_id = ${context.round_id} AND rc.contestant_id = ve.contestant_id
        WHERE ve.group_id = ${group.id} AND ve.voter_key = ${voterKey}
          AND rc.batch = ${currentBatch}
        UNION ALL
        SELECT 'throttle' AS row_type, NULL AS contestant_id, NULL AS created_at, COUNT(*) AS ip_count
        FROM vote_entries
        WHERE group_id = ${group.id} AND ip = ${ip} AND created_at >= ${throttleSince}
      `
      : await db.$queryRaw`
        SELECT 'entry' AS row_type, contestant_id, created_at, NULL AS ip_count
        FROM vote_entries
        WHERE group_id = ${group.id} AND voter_key = ${voterKey}
        UNION ALL
        SELECT 'throttle' AS row_type, NULL AS contestant_id, NULL AS created_at, COUNT(*) AS ip_count
        FROM vote_entries
        WHERE group_id = ${group.id} AND ip = ${ip} AND created_at >= ${throttleSince}
      `;
    const ipCount = Number(precheckRows.find((row) => row.row_type === "throttle")?.ip_count ?? 0);
    if (ipCount >= throttle.max) return fail("当前网络投票过于频繁，请稍后再试", 429);
    const scopedEntries = precheckRows.filter((row) => row.row_type === "entry").map((row) => ({
      contestant_id: row.contestant_id!, created_at: row.created_at!,
    }));
    const usedEntries = scopedEntries.filter((entry) => !dayStart || entry.created_at >= dayStart);
    if (usedEntries.length >= group.maxVotes) {
      return fail(group.votePeriod === "daily"
        ? (currentBatch > 0 ? "您本批今天的票数已用完" : "您今天的票数已用完，明天可继续投")
        : (currentBatch > 0 ? "您本批的票数已用完" : "您的票数已用完"), 403);
    }
    if (group.allowRepeat !== 1 && usedEntries.some((entry) => entry.contestant_id === contestantId)) {
      return fail("不可重复投同一选手", 403);
    }

    await db.$transaction([
      db.voteEntry.create({ data: { groupId: group.id, contestantId, voterKey, ip } }),
      db.$executeRaw`
        INSERT INTO group_stats (group_id, contestant_id, value_cache)
        VALUES (${group.id}, ${contestantId}, 1)
        ON DUPLICATE KEY UPDATE value_cache = value_cache + 1
      `,
    ]);
    publish(screenChannel(context.round_id.toString()), "update", { reason: "audience_vote" });
    return ok({ used: usedEntries.length + 1, remaining: group.maxVotes - usedEntries.length - 1 });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
