import { z } from "zod";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({ id: z.coerce.bigint() });

// 播放计数（公开，客户端 onPlay 触发 + 会话内去重；仅自托管视频，外链条目不接入）
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.video.update({
      where: { id: parsed.data.id },
      data: { views: { increment: 1 } },
    }).catch(() => null); // 视频已删除等情况静默忽略
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
