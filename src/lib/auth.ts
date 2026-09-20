import { cookies } from "next/headers";
import { db } from "./db";
import { token } from "./codes";

const COOKIE_NAME = "dth_session";
const SESSION_DAYS = 7;

export async function createSession(userId: bigint): Promise<string> {
  const id = token(24);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.session.create({ data: { id, userId, expiresAt } });
  cookies().set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (id) await db.session.deleteMany({ where: { id } });
  cookies().delete(COOKIE_NAME);
}

export async function currentUser() {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (!id) return null;
  const session = await db.session.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== 1) return null;
  return session.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AuthError();
  return user;
}

export class AuthError extends Error {}
