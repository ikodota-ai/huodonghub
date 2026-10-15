import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const users = await db.user.findMany({ orderBy: { id: "asc" } });
    return ok(users.map((u) => ({ id: u.id.toString(), username: u.username, name: u.name, role: u.role, status: u.status })));
  } catch (e) {
    return handleError(e);
  }
}

const schema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_]+$/, "用户名仅限字母数字下划线"),
  name: z.string().min(1).max(64),
  password: z.string().min(6).max(64),
  role: z.enum(["admin", "maintainer", "editor"]).default("editor"),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + parsed.error.issues[0]?.message);
    const exists = await db.user.findUnique({ where: { username: parsed.data.username } });
    if (exists) return fail("用户名已存在");
    const hash = await bcrypt.hash(parsed.data.password, 10);
    await db.user.create({ data: { username: parsed.data.username, name: parsed.data.name, role: parsed.data.role, passwordHash: hash } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
