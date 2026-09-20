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
  const openid = await wxFetchOpenid(wx.appid, wx.secret, code);
  if (!openid) return fail("微信授权失败，请重试", 400);
  cookies().set(wxCookieName(vote.id), signOpenid(openid), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600,
  });
  return Response.redirect(next);
}
