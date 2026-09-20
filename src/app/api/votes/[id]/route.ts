import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { getWxConfigFor, getWxGlobalConfig } from "@/lib/settings";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const vote = await db.vote.findUnique({
      where: { id: BigInt(params.id) },
      include: {
        rounds: {
          orderBy: { seq: "asc" },
          include: {
            groups: { orderBy: { sort: "asc" }, include: { _count: { select: { voters: true } } } },
            roundContestants: { select: { contestantId: true } },
          },
        },
        contestants: { orderBy: { sort: "asc" } },
      },
    });
    if (!vote) return fail("投票不存在", 404);
    const wxEffective = await getWxConfigFor(vote);
    const wxGlobal = await getWxGlobalConfig();
    return ok({
      id: vote.id.toString(), name: vote.name, cover: vote.cover, description: vote.description,
      wxAppid: vote.wxAppid ?? "", wxSecret: vote.wxSecret ?? "", status: vote.status,
      wxEffective: wxEffective ? { source: wxEffective.source, sourceName: wxEffective.sourceName } : null,
      wxGlobalConfigured: !!(wxGlobal.appid && wxGlobal.secret),
      rounds: vote.rounds.map((r) => ({
        id: r.id.toString(), name: r.name, seq: r.seq, status: r.status, code: r.code,
        audienceStartAt: r.audienceStartAt, audienceEndAt: r.audienceEndAt,
        screenShowResult: r.screenShowResult, screenShowPart: r.screenShowPart, audienceShowResult: r.audienceShowResult,
        screenGroupId: r.screenGroupId?.toString() ?? null, screenQrMode: r.screenQrMode,
        contestantIds: r.roundContestants.map((rc) => rc.contestantId.toString()),
        groups: r.groups.map((g) => ({
          id: g.id.toString(), name: g.name, kind: g.kind, weight: Number(g.weight),
          maxScore: g.maxScore, maxVotes: g.maxVotes, allowRepeat: g.allowRepeat,
          fixedPoints: g.fixedPoints == null ? null : Number(g.fixedPoints),
          restricted: g.restricted, sort: g.sort, voterCount: g._count.voters,
        })),
      })),
      contestants: vote.contestants.map((c) => ({
        id: c.id.toString(), number: c.number, name: c.name, intro: c.intro, image: c.image, sort: c.sort,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(500).optional(),
  cover: z.string().max(255).nullable().optional(),
  wxAppid: z.string().max(64).nullable().optional(),
  wxSecret: z.string().max(128).nullable().optional(),
  status: z.enum(["draft", "active", "finished", "archived"]).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.vote.update({ where: { id: BigInt(params.id) }, data: parsed.data });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireUser();
    await db.vote.delete({ where: { id: BigInt(params.id) } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
