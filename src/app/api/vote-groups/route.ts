import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({
  roundId: z.coerce.bigint(),
  name: z.string().min(1).max(64),
  kind: z.enum(["score", "vote"]),
  weight: z.number().min(0).max(100),
  maxScore: z.number().int().min(1).max(10000).default(100),
  maxVotes: z.number().int().min(1).max(100).default(3),
  allowRepeat: z.number().int().min(0).max(1).default(0),
  fixedPoints: z.number().positive().nullable().default(null),
  restricted: z.number().int().min(0).max(1).default(1),
  avgMode: z.enum(["scorers", "roster"]).default("scorers"),
  pctMode: z.enum(["batch", "round"]).default("batch"),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + parsed.error.issues[0]?.message);
    const d = parsed.data;
    const maxSort = await db.voteGroup.aggregate({ where: { roundId: d.roundId }, _max: { sort: true } });
    const group = await db.voteGroup.create({
      data: { ...d, sort: (maxSort._max.sort ?? 0) + 1 },
    });
    return ok({ id: group.id.toString() });
  } catch (e) {
    return handleError(e);
  }
}
