import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { getStorageConfig } from "@/lib/settings";
import { readStorageUsage } from "@/lib/storage-usage";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const config = await getStorageConfig();
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    return ok(await readStorageUsage(config, { refresh }));
  } catch (error) {
    return handleError(error);
  }
}

export const dynamic = "force-dynamic";
