import type { User } from "@prisma/client";

// 全量可见角色：admin 管理员 / maintainer 维护人员（授权后可查看并操作全部内容，便于排障）
export function canSeeAll(user: { role: string }): boolean {
  return user.role === "admin" || user.role === "maintainer";
}

// 列表查询过滤：editor 只能看到自己的内容；admin/maintainer 不过滤
export function ownerWhere(user: User): { ownerId?: bigint } {
  return canSeeAll(user) ? {} : { ownerId: user.id };
}

// 详情/操作校验：资源存在且（全量角色或本人所有）；不通过时统一对外 404，避免 ID 探测
export function canAccess(user: User, ownerId: bigint | null): boolean {
  return canSeeAll(user) || (ownerId != null && ownerId === user.id);
}

import { db } from "./db";

// ---- 子资源归属解析：沿外键链找到根内容（投票/视频分组）的 ownerId；资源不存在时返回 null ----
// 用法：if (!canAccess(user, await voteOwnerByRound(id))) return fail("轮次不存在", 404);

export async function voteOwnerByRound(roundId: bigint): Promise<bigint | null> {
  const r = await db.voteRound.findUnique({ where: { id: roundId }, select: { vote: { select: { ownerId: true } } } });
  return r?.vote.ownerId ?? null;
}

export async function voteOwnerByGroup(groupId: bigint): Promise<bigint | null> {
  const g = await db.voteGroup.findUnique({ where: { id: groupId }, select: { round: { select: { vote: { select: { ownerId: true } } } } } });
  return g?.round.vote.ownerId ?? null;
}

export async function voteOwnerByVoter(voterId: bigint): Promise<bigint | null> {
  const v = await db.voter.findUnique({ where: { id: voterId }, select: { group: { select: { round: { select: { vote: { select: { ownerId: true } } } } } } } });
  return v?.group.round.vote.ownerId ?? null;
}

export async function voteOwnerByContestant(contestantId: bigint): Promise<bigint | null> {
  const c = await db.voteContestant.findUnique({ where: { id: contestantId }, select: { vote: { select: { ownerId: true } } } });
  return c?.vote.ownerId ?? null;
}

export async function groupOwnerByVideo(videoId: bigint): Promise<bigint | null> {
  const v = await db.video.findUnique({ where: { id: videoId }, select: { group: { select: { ownerId: true } } } });
  return v?.group.ownerId ?? null;
}
