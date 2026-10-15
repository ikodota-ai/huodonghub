import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { token } from "@/lib/codes";
import { canAccess, voteOwnerByGroup } from "@/lib/ownership";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const groupId = new URL(req.url).searchParams.get("groupId");
    if (!groupId) return fail("缺少 groupId");
    if (!canAccess(user, await voteOwnerByGroup(BigInt(groupId)))) return fail("群体不存在", 404);
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
    const user = await requireUser();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const { groupId, names, needBind } = parsed.data;
    if (!canAccess(user, await voteOwnerByGroup(groupId))) return fail("群体不存在", 404);
    const created = await db.$transaction(
      names.map((name) => db.voter.create({ data: { groupId, name, token: token(16), needBind } }))
    );
    return ok({ count: created.length });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
