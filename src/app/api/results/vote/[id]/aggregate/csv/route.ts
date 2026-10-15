import { requireUser } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeVoteAggregate, toCsv } from "@/lib/scoring";
import { canAccess } from "@/lib/ownership";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const vote = await db.vote.findUnique({ where: { id: BigInt(params.id) }, include: { rounds: { orderBy: { seq: "asc" } } } });
    if (!vote || !canAccess(user, vote.ownerId)) return new Response("not found", { status: 404 });
    const agg = await computeVoteAggregate(vote.id);
    // 列：排名/编号/名称 + 每个合并群体两列（原始、得分）+ 总分
    const groupKeys: { key: string; name: string }[] = [];
    for (const item of agg.list) {
      for (const g of item.groups) {
        if (!groupKeys.some((k) => k.key === g.key)) groupKeys.push({ key: g.key, name: g.name });
      }
    }
    const header = ["排名", "编号", "名称", ...groupKeys.flatMap((g) => [`${g.name}(原始)`, `${g.name}(得分)`]), "总分"];
    const rows = agg.list.map((item, i) => [
      String(i + 1), item.number, item.name,
      ...groupKeys.flatMap((gk) => {
        const g = item.groups.find((x) => x.key === gk.key);
        if (!g) return ["-", "-"];
        const raw = g.kind === "score" ? `${g.scoreAvg}分` : `${g.votes}票(${g.votePct}%)`;
        return [raw, String(g.contribution)];
      }),
      String(item.total),
    ]);
    const csv = "﻿" + toCsv([header, ...rows]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vote_${vote.id}_aggregate.csv"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
