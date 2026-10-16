// 按东八区（Asia/Shanghai）日历日计算当日 00:00 对应的 UTC 时刻。
// 中国无夏令时，+08:00 恒定；观众投票"每天 N 票"按此时区的日历日重置，
// 不受服务器本地时区影响（借来的服务器时区不可控）。
export function chinaDayStart(now: Date = new Date()): Date {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return new Date(`${dateStr}T00:00:00+08:00`);
}
