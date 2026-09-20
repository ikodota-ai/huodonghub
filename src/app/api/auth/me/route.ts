import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

export async function GET() {
  const user = await currentUser();
  if (!user) return fail("未登录", 401);
  return ok({ name: user.name, role: user.role, username: user.username });
}
