import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { shortCode } from "@/lib/codes";
import { getWxGlobalConfig } from "@/lib/settings";

export async function GET() {
  try {
    await requireUser();
    const votes = await db.vote.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { rounds: true, contestants: true } } },
    });
    const wxGlobal = await getWxGlobalConfig();
    const hasGlobal = !!(wxGlobal.appid && wxGlobal.secret);
    return ok(votes.map((v) => ({
      id: v.id.toString(), name: v.name, cover: v.cover, status: v.status,
      roundCount: v._count.rounds, contestantCount: v._count.contestants,
      // openid=本投票自定义 global=跟随全局默认 fingerprint=均未配置
      wxMode: v.wxAppid && v.wxSecret ? "openid" : hasGlobal ? "global" : "fingerprint",
      updatedAt: v.updatedAt,
    })));
  } catch (e) {
    return handleError(e);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(500).optional(),
  cover: z.string().max(255).optional(),
  wxAppid: z.string().max(64).optional().or(z.literal("")),
  wxSecret: z.string().max(128).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + parsed.error.issues[0]?.message);
    const d = parsed.data;
    const vote = await db.vote.create({
      data: {
        name: d.name, description: d.description, cover: d.cover || null,
        wxAppid: d.wxAppid || null, wxSecret: d.wxSecret || null, status: "draft",
        rounds: {
          create: {
            name: "第一轮", seq: 1, code: shortCode(8),
            groups: {
              create: [
                { name: "专家评审", kind: "score", weight: 60, maxScore: 100, restricted: 1, sort: 1 },
                { name: "大众评审", kind: "score", weight: 20, maxScore: 100, restricted: 1, sort: 2 },
                { name: "观众评审", kind: "vote", weight: 20, maxVotes: 3, restricted: 0, sort: 3 },
              ],
            },
          },
        },
      },
    });
    return ok({ id: vote.id.toString() });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
