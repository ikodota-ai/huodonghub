import { requireUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { getDriver } from "@/lib/storage-driver";

export async function POST() {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const driver = await getDriver();
    const msg = await driver.test();
    return ok({ driver: driver.name, message: msg });
  } catch (e) {
    return fail(`连接失败：${(e as Error).message}`);
  }
}
