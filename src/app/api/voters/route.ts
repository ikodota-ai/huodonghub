import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { token } from "@/lib/codes";

export async function GET(req: Request) {
  try {
    await requireUser();
    const groupId = new URL(req.url).searchParams.get("groupId");
    if (!groupId) return fail("缺少 groupId");
    const voters = await db.voter.findMany({
      where: { groupId: BigInt(groupId) },
      orderBy: { id: "asc" },
    });
    return ok(voters.map((v) => ({
      id: v.id.toString(), name: v.name, token: v.token, needBind: v.needBind,
      bound: !!v.boundKey, boundAt: v.boundAt, hasVoted: v.hasVoted, votedAt: v.votedAt,
    })));
  } catch (e) {
    return handleError(e);
  }
}

const createSchema = z.object({
  groupId: z.coerce.bigint(),
  names: z.array(z.string().min(1).max(64)).min(1).max(200),
  needBind: z.number().int().min(0).max(1).default(1),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const { groupId, names, needBind } = parsed.data;
    const created = await db.$transaction(
      names.map((name) => db.voter.create({ data: { groupId, name, token: token(16), needBind } }))
    );
    return ok({ count: created.length });
  } catch (e) {
    return handleError(e);
  }
}
