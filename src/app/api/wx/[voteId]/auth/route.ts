import { fail } from "@/lib/api";
import { db } from "@/lib/db";
import { wxAuthorizeUrl } from "@/lib/wechat";
import { getWxConfigFor } from "@/lib/settings";

// 发起微信网页授权：/api/wx/{voteId}/auth?next=/vote/xxx 或 /judge/xxx
export async function GET(req: Request, { params }: { params: { voteId: string } }) {
  const vote = await db.vote.findUnique({ where: { id: BigInt(params.voteId) } });
  if (!vote) return fail("投票不存在", 404);
  const wx = await getWxConfigFor(vote);
  if (!wx) return fail("该投票未配置服务号", 400);
  const next = new URL(req.url).searchParams.get("next") || "/";
  const base = process.env.BASE_URL || new URL(req.url).origin;
  const redirectUri = `${base}/api/wx/callback?voteId=${vote.id}&next=${encodeURIComponent(next)}`;
  return Response.redirect(wxAuthorizeUrl(wx.appid, redirectUri, String(vote.id)));
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
