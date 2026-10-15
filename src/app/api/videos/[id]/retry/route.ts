import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { runVideoPipeline } from "@/lib/pipeline";
import { canAccess, groupOwnerByVideo } from "@/lib/ownership";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const id = BigInt(params.id);
    if (!canAccess(user, await groupOwnerByVideo(id))) return fail("视频不存在", 404);
    await db.video.update({ where: { id }, data: { processStatus: "processing" } });
    setImmediate(() => runVideoPipeline(id).catch(() => {}));
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
