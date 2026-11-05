"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { QrImage } from "@/components/ui";

interface ScreenState {
  voteName: string;
  cover: string | null;
  screenBgEnabled: boolean;
  screenBgImage: string | null;
  screenBgDim: number;
  roundName: string;
  status: string;
  code: string;
  screenGroupId: string | null;
  screenQrMode: boolean;
  screenShowResult: boolean;
  screenShowPart: boolean;
  screenPageSize: number;
  screenSortMode: "total" | "number" | "seq";
  countdownEndsAt: string | null;
  currentBatch: number;
  batches: number[];
  groups: { id: string; name: string; kind: string; weight: number }[];
  participation: { groupId: string; done: number; total: number }[];
  results: {
    contestantId: string; number: string; name: string; total: number;
    groups: { groupId: string; raw: number; contribution: number; participants: number }[];
  }[];
  serverTime: string;
}

const BAR_COLORS = ["#3B82F6", "#22C55E", "#F97316", "#EF4444", "#06B6D4", "#84CC16", "#A855F7", "#F43F5E", "#EAB308", "#14B8A6"];

type ScreenTheme = "total" | "expert" | "public" | "audience";

const SCREEN_THEMES: Record<ScreenTheme, { label: string; accent: string; glow: string }> = {
  total: {
    label: "总分揭晓",
    accent: "#E7C77E",
    glow: "radial-gradient(ellipse at 50% -12%, rgba(231,199,126,.18), transparent 52%), radial-gradient(ellipse at 8% 80%, rgba(107,30,46,.58), transparent 58%), radial-gradient(ellipse at 94% 30%, rgba(107,30,46,.38), transparent 55%)",
  },
  expert: {
    label: "专家评分",
    accent: "#D6A84F",
    glow: "radial-gradient(ellipse at 18% -10%, rgba(214,168,79,.24), transparent 56%), radial-gradient(ellipse at 92% 78%, rgba(214,168,79,.10), transparent 52%)",
  },
  public: {
    label: "大众评审",
    accent: "#8B7CF6",
    glow: "radial-gradient(ellipse at 82% -10%, rgba(139,124,246,.25), transparent 56%), radial-gradient(ellipse at 8% 82%, rgba(139,124,246,.12), transparent 54%)",
  },
  audience: {
    label: "观众投票",
    accent: "#28C7D9",
    glow: "radial-gradient(ellipse at 50% -12%, rgba(40,199,217,.22), transparent 58%), radial-gradient(ellipse at 94% 80%, rgba(40,199,217,.11), transparent 52%)",
  },
};

function resolveScreenTheme(groups: ScreenState["groups"], groupId: string | null): ScreenTheme {
  if (!groupId) return "total";
  const group = groups.find((item) => item.id === groupId);
  if (!group) return "total";
  if (group.kind === "vote") return "audience";
  return groups.find((item) => item.kind === "score")?.id === groupId ? "expert" : "public";
}

function screenStatus(status: string) {
  return { pending: "投票未开始", active: "投票进行中", paused: "投票已暂停", finished: "投票已结束" }[status] ?? status;
}

function Backdrop({ state, theme }: { state: ScreenState; theme: ScreenTheme }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = state.screenBgImage;
  const imageUrl = image
    ? /^https?:\/\//i.test(image)
      ? image
      : `/api/media/${image.replace(/^\/+/, "")}`
    : null;
  const showImage = Boolean(state.screenBgEnabled && imageUrl && failedImage !== imageUrl);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-screen-backdrop={showImage ? "image" : "ambient"}>
      {showImage && imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full select-none object-cover object-center" onError={() => setFailedImage(imageUrl)} data-screen-bg-image={imageUrl} />
      )}
      {showImage && <div className="absolute inset-0 bg-black" style={{ opacity: state.screenBgDim / 100 }} data-screen-bg-dim={state.screenBgDim} />}
      <div className="absolute inset-0" style={{ background: SCREEN_THEMES[theme].glow }} />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(2,5,12,.9),transparent_58%)]" />
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${SCREEN_THEMES[theme].accent}, transparent)` }} />
    </div>
  );
}

function ThemeBadge({ theme, centered = false }: { theme: ScreenTheme; centered?: boolean }) {
  const config = SCREEN_THEMES[theme];
  return (
    <div className={`inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-sm font-medium tracking-[.18em] ${centered ? "mx-auto" : ""}`} style={{ color: config.accent, borderColor: `${config.accent}50`, backgroundColor: `${config.accent}14` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.accent, boxShadow: `0 0 12px ${config.accent}` }} />
      {config.label}
    </div>
  );
}

export default function ScreenPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const [state, setState] = useState<ScreenState | null>(null);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [hintVisible, setHintVisible] = useState(true);
  const [view, setView] = useState<{ groupId: string | null; qr: boolean; showResult: boolean; showPart: boolean } | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/screen/${roundId}/state`).then((r) => r.json());
      if (res.ok && res.data) setState(res.data);
    } catch {}
  }, [roundId]);

  useEffect(() => {
    fetchState();
    const es = new EventSource(`/api/screen/${roundId}/stream`);
    es.addEventListener("update", () => fetchState());
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [fetchState]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const hint = setTimeout(() => setHintVisible(false), 5000);
    return () => { clearInterval(t); clearTimeout(hint); };
  }, []);

  const serverViewSignatureRef = useRef<string | null>(null);
  // 服务端"显示配置"变化时才同步视图；投票数据刷新不能覆盖大屏键盘临时选择的群体。
  // 否则键盘切到观众投票后，手机每投一票都会因 SSE 刷新被拉回服务端保存的"总分"。
  useEffect(() => {
    if (!state) return;
    const nextView = { groupId: state.screenGroupId, qr: state.screenQrMode, showResult: state.screenShowResult, showPart: state.screenShowPart };
    const signature = JSON.stringify(nextView);
    if (serverViewSignatureRef.current === signature) return;
    serverViewSignatureRef.current = signature;
    setView(nextView);
  }, [state]);

  const groupsRef = useRef(state?.groups);
  groupsRef.current = state?.groups;
  const viewRef = useRef(view);
  viewRef.current = view;
  const roundIdRef = useRef(roundId);
  roundIdRef.current = roundId;

  function applyView(next: { groupId: string | null; qr: boolean; showResult: boolean; showPart: boolean }) {
    setView(next);
    // 大屏浏览器若已登录管理员，键盘操作同时写入控制台配置；公开未登录大屏会返回 401/404，
    // 静默保持本地临时视图，且不会被投票数据刷新覆盖（由上方显示配置签名判断保证）。
    void fetch(`/api/console/${roundIdRef.current}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "screen",
        screenGroupId: next.groupId,
        screenQrMode: next.qr ? 1 : 0,
        screenShowResult: next.showResult ? 1 : 0,
        screenShowPart: next.showPart ? 1 : 0,
      }),
    }).catch(() => {});
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const groups = groupsRef.current;
      const v = viewRef.current;
      if (!groups || !v) return;
      const options: (string | null)[] = [null, ...groups.map((g) => g.id)];
      const idx = options.indexOf(v.groupId);
      if (e.key === "q" || e.key === "Q" || e.key === "2") applyView({ ...v, qr: !v.qr });
      else if (e.key === "r" || e.key === "R") applyView({ ...v, showResult: !v.showResult });
      else if (e.key === "p" || e.key === "P") applyView({ ...v, showPart: !v.showPart });
      else if (e.key === "ArrowRight") applyView({ ...v, groupId: options[(idx + 1) % options.length] });
      else if (e.key === "ArrowLeft") applyView({ ...v, groupId: options[(idx - 1 + options.length) % options.length] });
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!state || !view) {
    return <div className="min-h-screen bg-screenbg text-white flex items-center justify-center">加载中…</div>;
  }

  const countdown = state.countdownEndsAt ? Math.max(0, Math.floor((new Date(state.countdownEndsAt).getTime() - now) / 1000)) : null;
  const audienceUrl = typeof window !== "undefined" ? `${location.origin}/vote/${state.code}` : "";
  const theme = resolveScreenTheme(state.groups, view.groupId);

  return (
    <div className="relative isolate flex h-screen min-h-screen flex-col overflow-hidden bg-[#070B14] text-white" data-screen-theme={theme}>
      <Backdrop state={state} theme={theme} />
      {hintVisible && (
        <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/35 px-4 py-1.5 text-xs text-white/70 backdrop-blur-md">
          F 全屏 · Q/2 二维码 · ←→ 切换群体 · PgUp/PgDn 翻页 · R 显隐数值 · P 参与率
        </div>
      )}
      {view.qr ? (
        <QrMode state={state} url={audienceUrl} countdown={countdown} live={live} theme={theme} showPart={view.showPart} />
      ) : (
        <ChartMode state={state} view={view} live={live} countdown={countdown} theme={theme} />
      )}
    </div>
  );
}

function QrMode({ state, url, countdown, live, theme, showPart }: { state: ScreenState; url: string; countdown: number | null; live: boolean; theme: ScreenTheme; showPart: boolean }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px) and (min-height: 650px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const voteGroup = state.groups.find((group) => group.id === state.screenGroupId && group.kind === "vote") ?? state.groups.find((group) => group.kind === "vote");
  const part = voteGroup ? state.participation.find((item) => item.groupId === voteGroup.id) : null;
  const steps = ["打开微信，点击“扫一扫”", "扫描屏幕中央的二维码", "进入投票页，为选手投票"];
  const countdownText = countdown !== null && countdown > 0 ? `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}` : null;

  return (
    <div
      className={wide
        ? "relative z-10 mx-auto grid w-full max-w-[2200px] flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[clamp(48px,6vw,160px)] px-[clamp(40px,5vw,96px)] py-14"
        : "relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8"}
      data-qr-layout={wide ? "wide" : "compact"}
    >
      <div className={wide ? "min-w-0 max-w-[520px] justify-self-end" : "text-center"}>
        <ThemeBadge theme={theme} centered={!wide} />
        <h1 className={`${wide ? "mt-6 text-left text-[clamp(30px,2.6vw,52px)]" : "mt-4 text-[clamp(24px,5vw,36px)]"} font-bold leading-[1.22] tracking-wide`}>{state.voteName}</h1>
        <p className={`${wide ? "mt-4 text-xl" : "mt-2 text-base"} text-white/60`}>{state.roundName} · 投票评选</p>
        <div className={`${wide ? "mt-8 justify-start" : "mt-4 justify-center"} flex items-center gap-2 text-sm text-white/65`}>
          <span className={`h-2 w-2 rounded-full ${state.status === "active" && live ? "bg-emerald-400" : "bg-white/35"}`} />
          {screenStatus(state.status)}
        </div>
        {countdownText && (
          <div className={wide ? "mt-8" : "mt-4"}>
            <div className="text-xs uppercase tracking-[.28em] text-white/45">距投票结束</div>
            <div className="num mt-1 text-[clamp(36px,4vw,68px)] font-bold leading-none" style={{ color: SCREEN_THEMES[theme].accent }}>{countdownText}</div>
          </div>
        )}
      </div>

      <div className={`${wide ? "" : "mt-6"} shrink-0`}>
        <div
          className="rounded-[clamp(20px,2vw,32px)] bg-white p-[clamp(12px,1.4vw,24px)] shadow-[0_28px_90px_rgba(0,0,0,.45),0_0_0_1px_rgba(255,255,255,.3)]"
          style={{ width: wide ? "min(58vh, 31vw, 460px)" : "min(46vh, 70vw, 360px)" }}
        >
          <div className="aspect-square w-full [&_img]:h-full [&_img]:w-full [&_img]:rounded-xl [&>div]:!h-full [&>div]:!w-full">
            <QrImage text={url} size={512} />
          </div>
        </div>
        <p className={`${wide ? "mt-5 text-xl" : "mt-3 text-lg"} text-center font-medium tracking-[.35em] text-white/90`}>扫码投票</p>
      </div>

      <div className={wide ? "min-w-0 max-w-[440px] justify-self-start" : "mt-5 text-center"}>
        {wide && <h2 className="text-2xl font-semibold">微信扫码，三步参与</h2>}
        {wide ? (
          <ol className="mt-7 space-y-5">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-4 text-lg text-white/75">
                <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold" style={{ color: SCREEN_THEMES[theme].accent, borderColor: `${SCREEN_THEMES[theme].accent}55`, backgroundColor: `${SCREEN_THEMES[theme].accent}12` }}>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-white/60">微信扫一扫 · 进入投票页 · 为选手投票</p>
        )}
        {voteGroup && (
          <div className={wide ? "mt-8 border-t border-white/15 pt-5 text-base text-white/55" : "mt-3 text-xs text-white/50"}>
            {voteGroup.name} · 权重 {voteGroup.weight}%
            {showPart && part && <span className="ml-3 text-white/75">{part.total > 0 ? `已参与 ${part.done}/${part.total}` : `已参与 ${part.done} 人`}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartMode({ state, view, live, countdown, theme }: { state: ScreenState; view: { groupId: string | null; showResult: boolean; showPart: boolean }; live: boolean; countdown: number | null; theme: ScreenTheme }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ setOption: (o: unknown) => void; resize: () => void; dispatchAction: (a: unknown) => void } | null>(null);
  const [autoSize, setAutoSize] = useState(15);
  const [startIdx, setStartIdx] = useState(0);
  const startRef = useRef(0);

  // 每屏显示数：控制台 screenPageSize > 0 时用配置值，否则按屏宽自动
  const pageSize = state.screenPageSize;
  const winSize = pageSize > 0 ? pageSize : autoSize;
  useEffect(() => {
    const calc = () => {
      const w = containerRef.current?.clientWidth;
      if (w) setAutoSize(Math.max(8, Math.floor((w - 100) / 110)));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const groupInfo = view.groupId ? state.groups.find((g) => g.id === view.groupId) : null;
  const part = view.groupId ? state.participation.find((p) => p.groupId === view.groupId) : null;
  const partText = part
    ? part.total > 0
      ? `参与率 ${part.done}/${part.total} (${Math.round((part.done / part.total) * 100)}%)`
      : `参与 ${part.done} 人`
    : "";

  const rows = state.results.map((r) => {
    const base = { id: r.contestantId, name: `${r.number}-${r.name}` };
    if (!view.groupId) return { ...base, main: r.total, sub: "" };
    const d = r.groups.find((g) => g.groupId === view.groupId);
    if (!d) return { ...base, main: 0, sub: "" };
    if (groupInfo?.kind === "vote") return { ...base, main: d.raw, sub: `分数：${d.contribution}` };
    return { ...base, main: d.raw, sub: `折算：${d.contribution}` };
  });
  // 名次始终按当前显示指标降序计算（与展示顺序解耦，避免按编号展示时名次标错）
  const byScore = [...rows].sort((a, b) => b.main - a.main);
  const rankOf = new Map(byScore.map((r, i) => [r.id, i + 1] as const));
  // 展示顺序：total=按指标降序；number/seq=保持服务端返回顺序（按编号/出场），便于对号找选手
  const ranked = (state.screenSortMode === "total" ? byScore : rows).map((r) => ({ ...r, rank: rankOf.get(r.id) ?? 0 }));

  useEffect(() => {
    let disposed = false;
    import("echarts/core").then((echarts) => {
      import("echarts/charts").then(({ BarChart }) => {
        import("echarts/components").then(({ GridComponent, DataZoomComponent }) => {
          import("echarts/renderers").then(({ CanvasRenderer }) => {
            if (disposed || !containerRef.current) return;
            echarts.use([BarChart, GridComponent, DataZoomComponent, CanvasRenderer]);
            if (!chartRef.current) {
              chartRef.current = echarts.init(containerRef.current) as never;
            }
            const needZoom = ranked.length > winSize;
            const start = Math.min(startRef.current, Math.max(0, ranked.length - winSize));
            startRef.current = start;
            const end = Math.min(start + winSize - 1, ranked.length - 1);
            chartRef.current!.setOption({
              backgroundColor: "transparent",
              grid: { left: 60, right: 40, top: 84, bottom: 110 },
              dataZoom: needZoom ? [
                { type: "inside", xAxisIndex: 0, startValue: start, endValue: end, zoomLock: true },
                { type: "slider", xAxisIndex: 0, startValue: start, endValue: end, zoomLock: true, bottom: 12, height: 26, showDetail: false, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.06)", fillerColor: "rgba(255,255,255,0.15)", handleStyle: { color: "#fff" }, moveHandleSize: 6 },
              ] : [{ type: "inside", xAxisIndex: 0, startValue: 0, endValue: Math.max(0, ranked.length - 1) }],
              xAxis: {
                type: "category",
                data: ranked.map((r) => r.name),
                axisLabel: { color: "#fff", fontSize: 20, rotate: 45, interval: 0 },
                axisLine: { lineStyle: { color: "rgba(255,255,255,0.3)" } },
              },
              yAxis: {
                type: "value",
                axisLabel: { color: "rgba(255,255,255,0.6)", fontSize: 18 },
                splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
              },
              series: [{
                type: "bar",
                data: ranked.map((r, i) => ({ value: r.main, itemStyle: { color: BAR_COLORS[i % BAR_COLORS.length], borderRadius: [6, 6, 0, 0] } })),
                barMaxWidth: 70,
                label: {
                  show: view.showResult, position: "top", color: "#fff", fontSize: 22, fontWeight: "bold",
                  formatter: (p: { dataIndex: number }) => {
                    const r = ranked[p.dataIndex];
                    return r.sub ? `{rk|第${r.rank}名}\n${r.main}\n{sb|${r.sub}}` : `{rk|第${r.rank}名}\n${r.main}`;
                  },
                  rich: {
                    rk: { color: "rgba(255,255,255,0.55)", fontSize: 15, fontWeight: "normal", lineHeight: 22 },
                    sb: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: "normal", lineHeight: 20 },
                  },
                },
                animationDurationUpdate: 600,
                animationEasingUpdate: "cubicOut",
              }],
            });
            chartRef.current!.resize();
          });
        });
      });
    });
    return () => { disposed = true; };
  }, [JSON.stringify(ranked), view.showResult, winSize]);

  // 键盘翻页（PageUp/PageDown，兼容翻页笔；↑/↓ 同效；整屏翻页，末屏后再翻回首页）
  const needPaging = rows.length > winSize;
  useEffect(() => {
    if (!needPaging) return;
    const onKey = (e: KeyboardEvent) => {
      const n = rows.length;
      let s = startRef.current;
      if (e.key === "PageDown" || e.key === "ArrowDown") {
        s = s + winSize >= n ? 0 : s + winSize;
      } else if (e.key === "PageUp" || e.key === "ArrowUp") {
        s = s - winSize < 0 ? Math.max(0, Math.floor((n - 1) / winSize) * winSize) : s - winSize;
      } else return;
      e.preventDefault();
      startRef.current = s;
      setStartIdx(s);
      chartRef.current?.dispatchAction({ type: "dataZoom", startValue: s, endValue: Math.min(s + winSize - 1, n - 1) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [needPaging, rows.length, winSize]);

  useEffect(() => {
    const fn = () => chartRef.current?.resize();
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const timeStr = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const themeConfig = SCREEN_THEMES[theme];

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col px-[clamp(24px,3vw,64px)] pb-10 pt-[clamp(24px,3vh,42px)]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <ThemeBadge theme={theme} />
          <h1 className="mt-4 text-[clamp(24px,2vw,40px)] font-bold leading-tight tracking-wide">{state.voteName} · {state.roundName} · {groupInfo ? groupInfo.name : "总分"}</h1>
          <p className="mt-2 text-lg text-white/55">
            {groupInfo ? `群体类型：${groupInfo.kind === "score" ? "评分群体" : "投票群体"} · 权重：${groupInfo.weight}%${view.showPart && partText ? ` · ${partText}` : ""}` : "全部群体加权总分"}
            {state.batches.length > 1 && state.currentBatch > 0 && (
              <span className="ml-3 inline-flex items-center rounded-full px-3 py-0.5 text-base font-bold" style={{ color: themeConfig.accent, backgroundColor: `${themeConfig.accent}22` }}>第 {state.currentBatch} 批 / 共 {state.batches.length} 批</span>
            )}
          </p>
        </div>
        <div className="ml-6 shrink-0 text-right">
          <div className={`flex items-center gap-2 justify-end text-lg ${live ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${live ? "bg-green-400" : "bg-red-400"}`} /> {live ? "实时" : "重连中"}
          </div>
          <div className="text-white/50 text-lg num mt-1">{timeStr}</div>
          {countdown !== null && countdown > 0 && (
            <div className="text-4xl font-bold num mt-2" style={{ color: themeConfig.accent }}>{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</div>
          )}
        </div>
      </div>
      <div className="relative mt-3 min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {needPaging && (
          <div className="absolute right-2 top-1 z-10 bg-white/10 text-white/60 text-sm px-3 py-1 rounded-full num">
            第 {startIdx + 1}–{Math.min(startIdx + winSize, ranked.length)} 位 / 共 {ranked.length} 位
          </div>
        )}
      </div>
      <StatusBar status={state.status} live={live} />
    </div>
  );
}

function StatusBar({ status, live }: { status: string; live: boolean }) {
  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap text-sm text-white/40">
      <span className={`w-2 h-2 rounded-full ${status === "active" && live ? "bg-green-400" : "bg-white/30"}`} />
      {screenStatus(status)}
    </div>
  );
}
