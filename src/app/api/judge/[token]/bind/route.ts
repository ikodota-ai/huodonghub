import { z } from "zod";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { fallbackVoterKey } from "@/lib/fingerprint";
import { wxOpenidFromCookies } from "@/lib/wx-openid";

const schema = z.object({ fp: z.string().max(128).optional() });

// 首次打开绑定：优先微信 openid（经 /api/wx 授权流写入 cookie），否则设备指纹
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const voter = await db.voter.findUnique({ where: { token: params.token }, include: { group: { include: { round: true } } } });
    if (!voter) return fail("评分码无效", 404);
    if (voter.boundKey) return ok({ bound: true, already: true });

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    const openid = await wxOpenidFromCookies(voter.group.round.voteId);
    const fp = parsed.success ? parsed.data.fp : undefined;
    const key = openid || (fp ? fallbackVoterKey(fp) : null);
    if (!key) return fail("无法确定身份，请刷新重试");

    const clash = await db.voter.findFirst({ where: { boundKey: key, id: { not: voter.id } } });
    if (clash) return fail("此微信/设备已绑定其他评审码", 409);

    await db.voter.update({ where: { id: voter.id }, data: { boundKey: key, boundAt: new Date() } });
    return ok({ bound: true });
  } catch (e) {
    return handleError(e);
  }
}
