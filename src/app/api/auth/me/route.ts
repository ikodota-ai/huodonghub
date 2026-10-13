import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

export async function GET() {
  const user = await currentUser();
  if (!user) return fail("未登录", 401);
  return ok({ name: user.name, role: user.role, username: user.username });
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
