import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("admin123", 10);
  await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash: hash, name: "管理员", role: "admin" },
  });
  console.log("seeded: admin / admin123（请登录后尽快修改密码）");
}

main().finally(() => db.$disconnect());
