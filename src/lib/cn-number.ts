// 中文序数：1→一 … 10→十 … 11→十一 … 20→二十 … 99→九十九（集数编号用，覆盖 1-99 足够）
const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function cnNumber(n: number): string {
  if (n <= 0 || n > 99) return String(n);
  if (n < 10) return DIGITS[n];
  if (n === 10) return "十";
  if (n < 20) return `十${DIGITS[n % 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${DIGITS[tens]}十${ones ? DIGITS[ones] : ""}`;
}

// 去掉标题已有的"第X集"前缀（重排序号时保持幂等）
export function stripEpisodePrefix(title: string): string {
  return title.replace(/^第[一二三四五六七八九十百零0-9]+集\s*/, "").trim();
}

export function episodeTitle(n: number, base: string): string {
  return `第${cnNumber(n)}集 ${stripEpisodePrefix(base)}`;
}
