import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { getWxGlobalConfig, setSetting } from "@/lib/settings";

export async function GET() {
  try {
    await requireUser();
    const cfg = await getWxGlobalConfig();
    return ok({ ...cfg, secret: cfg.secret ? "***" : "" });
  } catch (e) {
    return handleError(e);
  }
}

const schema = z.object({
  appid: z.string().max(64).default(""),
  secret: z.string().max(128).default(""),
  name: z.string().max(64).default(""),
});

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const d = parsed.data;
    // secret 填 *** 表示不修改；appid 清空时整体清空
    const current = await getWxGlobalConfig();
    const secret = d.secret === "***" ? current.secret : d.secret;
    const appid = d.appid.trim();
    await setSetting("wx.default", JSON.stringify({
      appid,
      secret: appid ? secret : "",
      name: d.name.trim(),
    }));
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
