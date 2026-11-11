export function canClearVoteData(status: string | null | undefined): boolean {
  return status === "draft";
}

export function canTransitionVoteStatus(current: string, target: string): boolean {
  const transitions: Record<string, string[]> = {
    draft: ["active"],
    active: ["finished"],
    finished: ["archived"],
    archived: [],
  };
  return transitions[current]?.includes(target) ?? false;
}

export function voteAcceptsSubmissions(status: string | null | undefined): boolean {
  return status === "draft" || status === "active";
}

export function voteDataLockedMessage(status: string | null | undefined): string {
  if (status === "active") return "活动已转为正式，禁止清空数据";
  if (status === "finished") return "活动已结束，禁止清空数据";
  if (status === "archived") return "活动已归档，禁止清空数据";
  return "当前活动状态禁止清空数据";
}
