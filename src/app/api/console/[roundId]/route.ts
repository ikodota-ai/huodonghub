import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { publish, screenChannel } from "@/lib/sse";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["pending", "active", "paused", "finished"]) }),
  z.object({ action: z.literal("screen"), screenGroupId: z.coerce.bigint().nullable().optional(), screenQrMode: z.number().int().min(0).max(1).optional(), screenShowResult: z.number().int().min(0).max(1).optional(), screenShowPart: z.number().int().min(0).max(1).optional() }),
  z.object({ action: z.literal("countdown"), seconds: z.number().int().min(0).max(86400) }),
  z.object({ action: z.literal("resetData") }),
]);

// 控制台实时数据：各群体参与情况 + 观众投票 IP 分布（仅管理员）
export async function GET(_req: Request, { params }: { params: { roundId: string } }) {
  try {
    await requireUser();
    const roundId = BigInt(params.roundId);
    const groups = await db.voteGroup.findMany({ where: { roundId }, orderBy: { sort: "asc" } });

    const participation = await Promise.all(groups.map(async (g) => {
      if (g.kind === "score" || g.restricted === 1) {
        const total = await db.voter.count({ where: { groupId: g.id } });
        const done = await db.voter.count({ where: { groupId: g.id, hasVoted: 1 } });
        return { groupId: g.id.toString(), name: g.name, kind: g.kind, mode: "roster" as const, done, total };
      }
      const rows: { c: bigint }[] = await db.$queryRaw`
        SELECT COUNT(DISTINCT voter_key) AS c FROM vote_entries WHERE group_id = ${g.id}`;
      const tickets = await db.voteEntry.count({ where: { groupId: g.id } });
      return { groupId: g.id.toString(), name: g.name, kind: g.kind, mode: "open" as const, done: Number(rows[0]?.c ?? 0), total: tickets };
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
    return ok({ participation, topIps });
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
        },
      });
    } else if (d.action === "countdown") {
      await db.voteRound.update({
        where: { id: roundId },
        data: { countdownEndsAt: d.seconds > 0 ? new Date(Date.now() + d.seconds * 1000) : null },
      });
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
