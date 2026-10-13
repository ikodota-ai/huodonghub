import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { getStorageConfig, setSetting } from "@/lib/settings";
import { MEDIA_ROOT, dirSizeBytes } from "@/lib/storage";

export async function GET() {
  try {
    await requireUser();
    const cfg = await getStorageConfig();
    return ok({
      ...cfg,
      oss: { ...cfg.oss, accessKeySecret: cfg.oss.accessKeySecret ? "***" : "" },
      localBytes: dirSizeBytes(MEDIA_ROOT),
    });
  } catch (e) {
    return handleError(e);
  }
}

const schema = z.object({
  driver: z.enum(["local", "oss"]),
  oss: z.object({
    region: z.string().max(64).default(""),
    bucket: z.string().max(64).default(""),
    accessKeyId: z.string().max(128).default(""),
    accessKeySecret: z.string().max(128).default(""),
    prefix: z.string().max(128).default("dth/"),
    publicDomain: z.string().max(255).default(""),
    private: z.boolean().default(false),
  }),
});

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return ok(null);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return ok(null);
    const d = parsed.data;
    // secret 填 *** 表示不修改
    const current = await getStorageConfig();
    const secret = d.oss.accessKeySecret === "***" || d.oss.accessKeySecret === ""
      ? (d.oss.accessKeySecret === "" ? "" : current.oss.accessKeySecret)
      : d.oss.accessKeySecret;
    await setSetting("storage.config", JSON.stringify({ driver: d.driver, oss: { ...d.oss, accessKeySecret: secret } }));
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
