import { fail } from "@/lib/api";
import { db } from "@/lib/db";
import { wxFetchOpenid } from "@/lib/wechat";
import { getWxConfigFor } from "@/lib/settings";
import { signOpenid, wxCookieName } from "@/lib/wx-openid";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const voteId = url.searchParams.get("voteId");
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  if (!voteId || !code) return fail("授权参数缺失");
  const vote = await db.vote.findUnique({ where: { id: BigInt(voteId) } });
  if (!vote) return fail("投票不存在", 404);
  const wx = await getWxConfigFor(vote);
  if (!wx) return fail("该投票未配置服务号", 400);
  const r = await wxFetchOpenid(wx.appid, wx.secret, code);
  if (!r.openid) {
    console.error(`[wx] code换openid失败 vote=${voteId} ${r.error}`);
    return fail(`微信授权失败（${r.error}）。常见原因：AppID/AppSecret 填错、非认证服务号、授权链接已过期（返回重新进入即可）`, 400);
  }
  cookies().set(wxCookieName(vote.id), signOpenid(r.openid), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600,
  });
  return Response.redirect(next);
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
