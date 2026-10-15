"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { QrImage } from "@/components/ui";

interface ScreenState {
  voteName: string;
  cover: string | null;
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

  // 服务端状态 → 本地视图（键盘可临时覆盖，服务端变更时同步）
  useEffect(() => {
    if (state) setView({ groupId: state.screenGroupId, qr: state.screenQrMode, showResult: state.screenShowResult, showPart: state.screenShowPart });
  }, [state]);

  const groupsRef = useRef(state?.groups);
  groupsRef.current = state?.groups;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const groups = groupsRef.current;
      const v = viewRef.current;
      if (!groups || !v) return;
      const options: (string | null)[] = [null, ...groups.map((g) => g.id)];
      const idx = options.indexOf(v.groupId);
      if (e.key === "q" || e.key === "Q" || e.key === "2") setView({ ...v, qr: !v.qr });
      else if (e.key === "r" || e.key === "R") setView({ ...v, showResult: !v.showResult });
      else if (e.key === "p" || e.key === "P") setView({ ...v, showPart: !v.showPart });
      else if (e.key === "ArrowRight") setView({ ...v, groupId: options[(idx + 1) % options.length] });
      else if (e.key === "ArrowLeft") setView({ ...v, groupId: options[(idx - 1 + options.length) % options.length] });
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

  return (
    <div className="min-h-screen bg-screenbg text-white flex flex-col overflow-hidden">
      {hintVisible && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/10 text-white/70 text-xs px-4 py-1.5 rounded-full">
          F 全屏 · Q/2 二维码 · ←→ 切换群体 · PgUp/PgDn 翻页 · R 显隐数值 · P 参与率
        </div>
      )}
      {view.qr ? (
        <QrMode state={state} url={audienceUrl} countdown={countdown} live={live} />
      ) : (
        <ChartMode state={state} view={view} live={live} countdown={countdown} />
      )}
    </div>
  );
}

function QrMode({ state, url, countdown, live }: { state: ScreenState; url: string; countdown: number | null; live: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">{state.voteName}</h1>
      <p className="text-xl text-white/60 mb-8">{state.roundName} · 投票评选</p>
      <div className="bg-white p-6 rounded-3xl shadow-2xl">
        <QrImage text={url} size={380} />
      </div>
      <p className="text-2xl font-medium mt-8 tracking-widest">扫 码 投 票</p>
      {countdown !== null && countdown > 0 && (
        <p className="text-6xl font-bold text-brand mt-4 num">
          {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
        </p>
      )}
      <StatusBar status={state.status} live={live} />
    </div>
  );
}

function ChartMode({ state, view, live, countdown }: { state: ScreenState; view: { groupId: string | null; showResult: boolean; showPart: boolean }; live: boolean; countdown: number | null }) {
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

  return (
    <div className="flex-1 flex flex-col p-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{state.voteName} · {state.roundName} · {groupInfo ? groupInfo.name : "总分"} <span className="text-white/50 text-2xl">实时显示</span></h1>
          <p className="text-white/50 mt-2 text-lg">
            {groupInfo ? `群体类型：${groupInfo.kind === "score" ? "评分群体" : "投票群体"} · 权重：${groupInfo.weight}%${view.showPart && partText ? ` · ${partText}` : ""}` : "全部群体加权总分"}
            {state.batches.length > 0 && state.currentBatch > 0 && (
              <span className="ml-3 inline-flex items-center rounded-full bg-brand/25 text-white px-3 py-0.5 text-base font-bold">第 {state.currentBatch} 批 / 共 {state.batches.length} 批</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-2 justify-end text-lg ${live ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${live ? "bg-green-400" : "bg-red-400"}`} /> {live ? "实时" : "重连中"}
          </div>
          <div className="text-white/50 text-lg num mt-1">{timeStr}</div>
          {countdown !== null && countdown > 0 && (
            <div className="text-4xl font-bold text-brand num mt-2">{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</div>
          )}
        </div>
      </div>
      <div className="relative flex-1 mt-4">
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
  const text = { pending: "投票未开始", active: "投票进行中", paused: "投票已暂停", finished: "投票已结束" }[status] ?? status;
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-sm flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${status === "active" && live ? "bg-green-400" : "bg-white/30"}`} />
      {text}
    </div>
  );
}
