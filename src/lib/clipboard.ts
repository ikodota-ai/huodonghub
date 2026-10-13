// 复制到剪贴板：优先 navigator.clipboard（仅 HTTPS/localhost 等安全上下文可用），
// HTTP 部署环境自动降级为隐藏 textarea + execCommand("copy")（老 API 但全浏览器可用了二十年）
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 安全上下文外会抛错，走降级 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
