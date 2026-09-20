import { requireUser } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeRoundResults, toCsv } from "@/lib/scoring";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const round = await db.voteRound.findUnique({ where: { id: BigInt(params.id) }, include: { vote: true, groups: { orderBy: { sort: "asc" } } } });
    if (!round) return new Response("not found", { status: 404 });
    const results = await computeRoundResults(round.id);
    const header = ["排名", "编号", "名称", ...round.groups.flatMap((g) => [`${g.name}(原始)`, `${g.name}(得分)`]), "总分"];
    const rows = results.map((r, i) => [
      String(i + 1), r.number, r.name,
      ...r.groups.flatMap((d) => [d.kind === "vote" ? `${d.raw}票/${d.participants}人` : `${d.raw}`, String(d.contribution)]),
      String(r.total),
    ]);
    const csv = "﻿" + toCsv([header, ...rows]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="round_${round.id}_results.csv"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
