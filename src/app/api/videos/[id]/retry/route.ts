import { requireUser } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { runVideoPipeline } from "@/lib/pipeline";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const id = BigInt(params.id);
    await db.video.update({ where: { id }, data: { processStatus: "processing" } });
    setImmediate(() => runVideoPipeline(id).catch(() => {}));
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
