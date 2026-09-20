import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { parseArticle } from "@/lib/wechat";

const schema = z.object({ url: z.string().url() });

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return ok({ videos: [], error: "链接格式不正确" });
    try {
      const result = await parseArticle(parsed.data.url);
      return ok(result);
    } catch (e) {
      return ok({ videos: [], error: (e as Error).message });
    }
  } catch (e) {
    return handleError(e);
  }
}
