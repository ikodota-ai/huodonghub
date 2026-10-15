import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { publish, screenChannel } from "@/lib/sse";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["pending", "active", "paused", "finished"]) }),
  z.object({ action: z.literal("screen"), screenGroupId: z.coerce.bigint().nullable().optional(), screenQrMode: z.number().int().min(0).max(1).optional(), screenShowResult: z.number().int().min(0).max(1).optional(), screenShowPart: z.number().int().min(0).max(1).optional(), screenPageSize: z.number().int().min(0).max(50).optional() }),
  z.object({ action: z.literal("countdown"), seconds: z.number().int().min(0).max(86400) }),
  z.object({ action: z.literal("batch"), currentBatch: z.number().int().min(0).max(99) }),
  z.object({ action: z.literal("resetData") }),
]);

// 群体在当前批次的参与统计：batch=0 时统计整轮（旧行为）
async function groupParticipation(g: { id: bigint; kind: string; restricted: number }, roundId: bigint, batch: number) {
  const batchJoin = batch > 0;
  if (g.kind === "score") {
    const total = await db.voter.count({ where: { groupId: g.id } });
    let done: number;
    if (batchJoin) {
      const rows: { c: bigint }[] = await db.$queryRaw`
        SELECT COUNT(DISTINCT se.voter_id) AS c FROM score_entries se
        JOIN round_contestants rc ON rc.contestant_id = se.contestant_id AND rc.round_id = ${roundId}
        WHERE se.group_id = ${g.id} AND rc.batch = ${batch}`;
      done = Number(rows[0]?.c ?? 0);
    } else {
      done = await db.voter.count({ where: { groupId: g.id, hasVoted: 1 } });
    }
    return { groupId: g.id.toString(), done, total };
  }
  if (batchJoin) {
    const rows: { c: bigint }[] = await db.$queryRaw`
      SELECT COUNT(DISTINCT ve.voter_key) AS c FROM vote_entries ve
      JOIN round_contestants rc ON rc.contestant_id = ve.contestant_id AND rc.round_id = ${roundId}
      WHERE ve.group_id = ${g.id} AND rc.batch = ${batch}`;
    const tickets: { t: bigint }[] = await db.$queryRaw`
      SELECT COUNT(*) AS t FROM vote_entries ve
      JOIN round_contestants rc ON rc.contestant_id = ve.contestant_id AND rc.round_id = ${roundId}
      WHERE ve.group_id = ${g.id} AND rc.batch = ${batch}`;
    return { groupId: g.id.toString(), done: Number(rows[0]?.c ?? 0), total: Number(tickets[0]?.t ?? 0) };
  }
  if (g.restricted === 1) {
    const total = await db.voter.count({ where: { groupId: g.id } });
    const done = await db.voter.count({ where: { groupId: g.id, hasVoted: 1 } });
    return { groupId: g.id.toString(), done, total };
  }
  const rows: { c: bigint }[] = await db.$queryRaw`
    SELECT COUNT(DISTINCT voter_key) AS c FROM vote_entries WHERE group_id = ${g.id}`;
  const tickets = await db.voteEntry.count({ where: { groupId: g.id } });
  return { groupId: g.id.toString(), done: Number(rows[0]?.c ?? 0), total: tickets };
}

// 控制台实时数据：各群体参与情况 + 观众投票 IP 分布（仅管理员）
export async function GET(_req: Request, { params }: { params: { roundId: string } }) {
  try {
    await requireUser();
    const roundId = BigInt(params.roundId);
    const round = await db.voteRound.findUnique({
      where: { id: roundId },
      include: { groups: { orderBy: { sort: "asc" } }, roundContestants: { select: { batch: true } } },
    });
    if (!round) return fail("轮次不存在", 404);
    const groups = round.groups;
    const batches = [...new Set(round.roundContestants.map((rc) => rc.batch).filter((b) => b > 0))].sort((a, b) => a - b);
    const currentBatch = round.currentBatch;

    const participation = await Promise.all(groups.map(async (g) => {
      const p = await groupParticipation(g, roundId, currentBatch);
      const mode = g.kind === "score" || g.restricted === 1 ? "roster" as const : "open" as const;
      return { ...p, name: g.name, kind: g.kind, mode };
    }));

    // 开放投票群体的 IP 分布 Top10（识别刷票）
    const openGroupIds = groups.filter((g) => g.kind === "vote" && g.restricted === 0).map((g) => g.id);
    let topIps: { ip: string; count: number }[] = [];
    if (openGroupIds.length > 0) {
      const rows: { ip: string | null; c: bigint }[] = await db.$queryRaw`
        SELECT ip, COUNT(*) AS c FROM vote_entries
        WHERE group_id IN (${Prisma.join(openGroupIds)})
        GROUP BY ip ORDER BY c DESC LIMIT 10`;
      topIps = rows.map((r) => ({ ip: r.ip || "未知", count: Number(r.c) }));
    }
    return ok({ participation, topIps, currentBatch, batches });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: { params: { roundId: string } }) {
  try {
    await requireUser();
    const roundId = BigInt(params.roundId);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const d = parsed.data;

    if (d.action === "status") {
      await db.voteRound.update({ where: { id: roundId }, data: { status: d.status } });
    } else if (d.action === "screen") {
      await db.voteRound.update({
        where: { id: roundId },
        data: {
          screenGroupId: d.screenGroupId === undefined ? undefined : d.screenGroupId,
          screenQrMode: d.screenQrMode,
          screenShowResult: d.screenShowResult,
          screenShowPart: d.screenShowPart,
          screenPageSize: d.screenPageSize,
        },
      });
    } else if (d.action === "countdown") {
      await db.voteRound.update({
        where: { id: roundId },
        data: { countdownEndsAt: d.seconds > 0 ? new Date(Date.now() + d.seconds * 1000) : null },
      });
    } else if (d.action === "batch") {
      // 切换当前开放批次：0=全部，N=第 N 批（须是名单中存在的批次）
      const rcs = await db.roundContestant.findMany({ where: { roundId }, select: { batch: true } });
      const batches = new Set(rcs.map((rc) => rc.batch));
      if (d.currentBatch > 0 && !batches.has(d.currentBatch)) return fail(`第 ${d.currentBatch} 批不在本轮名单中`);
      await db.voteRound.update({ where: { id: roundId }, data: { currentBatch: d.currentBatch } });
    } else if (d.action === "resetData") {
      // 彩排重置：清空本轮全部评分/投票流水与计数器，重置评委提交状态；保留配置、名单与绑定
      // 仅 pending/paused 可清空（彩排场景）；active 防现场误清；finished 为结果存档，重投请新建轮次
      const round = await db.voteRound.findUnique({ where: { id: roundId }, select: { status: true } });
      if (round?.status === "active") return fail("投票进行中，请先暂停本轮再清空数据", 409);
      if (round?.status === "finished") return fail("已结束的轮次不可清空（结果存档）。如需重新投票，请新建轮次", 409);
      const groups = await db.voteGroup.findMany({ where: { roundId }, select: { id: true } });
      const groupIds = groups.map((g) => g.id);
      await db.$transaction([
        db.scoreEntry.deleteMany({ where: { groupId: { in: groupIds } } }),
        db.voteEntry.deleteMany({ where: { groupId: { in: groupIds } } }),
        db.groupStat.deleteMany({ where: { groupId: { in: groupIds } } }),
        db.voter.updateMany({ where: { groupId: { in: groupIds } }, data: { hasVoted: 0, votedAt: null } }),
      ]);
    }
    publish(screenChannel(roundId.toString()), "update", { reason: `console_${d.action}` });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
