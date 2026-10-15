import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

// 新格式：contestants（含批次/出场顺序）；兼容旧格式：contestantIds（批次 0 全员）
const schema = z.object({
  contestantIds: z.array(z.coerce.bigint()).max(500).optional(),
  contestants: z.array(z.object({
    contestantId: z.coerce.bigint(),
    batch: z.number().int().min(0).max(99).default(0),
    seq: z.number().int().min(0).max(9999).default(0),
  })).max(500).optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const items = parsed.data.contestants
      ?? (parsed.data.contestantIds ?? []).map((contestantId, i) => ({ contestantId, batch: 0, seq: i + 1 }));
    // 批次语义：全 0=全员投票；全 ≥1=分批比拼；不允许混合（"全员"与"分批"语义冲突）
    const batches = new Set(items.map((it) => it.batch));
    if (batches.has(0) && batches.size > 1) {
      return fail("批次设置不能混合：要么全部为 0（全员投票），要么全部 ≥1（分批比拼）");
    }
    const dup = new Set<string>();
    for (const it of items) {
      const k = it.contestantId.toString();
      if (dup.has(k)) return fail("存在重复选手");
      dup.add(k);
    }
    const roundId = BigInt(params.id);
    // 校验选手归属本投票，避免外键 500
    const round = await db.voteRound.findUnique({ where: { id: roundId }, select: { voteId: true } });
    if (!round) return fail("轮次不存在", 404);
    if (items.length > 0) {
      const owned = await db.voteContestant.count({ where: { voteId: round.voteId, id: { in: items.map((it) => it.contestantId) } } });
      if (owned !== items.length) return fail("存在不属于本投票的选手");
    }
    await db.$transaction([
      db.roundContestant.deleteMany({ where: { roundId } }),
      db.roundContestant.createMany({
        data: items.map((it) => ({ roundId, contestantId: it.contestantId, batch: it.batch, seq: it.seq })),
      }),
      // 名单变化后当前批次指针可能越界，重置为开放全部，由控制台重新切换
      db.voteRound.update({ where: { id: roundId }, data: { currentBatch: 0 } }),
    ]);
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
