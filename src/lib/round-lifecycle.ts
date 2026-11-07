export function isRoundDraft(status: string | null | undefined) {
  return status === "pending";
}

export function roundDataLockedMessage(status: string | null | undefined) {
  if (status === "paused") return "轮次已暂停，暂停后也不可清空评分或投票数据";
  if (status === "finished") return "轮次已结束，不可清空评分或投票数据";
  return "轮次已开始，不可清空评分或投票数据";
}
