"use client";

import { useEffect, useRef, useState } from "react";
import { isWeChat } from "./public-widgets";

export interface PlaylistItem {
  id: string;
  idx: number;
  title: string;
  duration: string;
  src: string;
  cover: string | null;
  external?: boolean;
  sourceUrl?: string | null;
}

// 合集播放器：列表内切换不刷新页面，当前条目标记"正在播放"，支持自动连播
export function PlaylistPlayer({ items, startId, groupName, groupHref }: {
  items: PlaylistItem[];
  startId: string;
  groupName: string;
  groupHref: string;
}) {
  const [currentId, setCurrentId] = useState(startId);
  const [autoNext, setAutoNext] = useState(true);
  const [wx, setWx] = useState(false); // mounted 后才是真实值，避免 SSR/CSR 不一致
  const videoRef = useRef<HTMLVideoElement>(null);
  const current = items.find((v) => v.id === currentId) ?? items[0];

  useEffect(() => { setWx(isWeChat()); }, []);

  function play(id: string, autoplay = true) {
    const v = items.find((x) => x.id === id);
    if (!v || id === currentId) return;
    if (v.external && v.sourceUrl && isWeChat()) {
      location.href = v.sourceUrl; // 微信内点击外链条目：直跳视频号
      return;
    }
    setCurrentId(id);
    window.history.replaceState(null, "", `${groupHref}/play/${id}`);
    if (autoplay) {
      // 等 React 更新 video src 后播放
      setTimeout(() => videoRef.current?.play().catch(() => {}), 50);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onEnded() {
    if (!autoNext) return;
    const idx = items.findIndex((v) => v.id === currentId);
    const next = items.slice(idx + 1).find((v) => !v.external); // 外链条目无法页内播放，连播时跳过
    if (next) play(next.id);
  }

  useEffect(() => {
    document.title = `${current.title} · ${groupName}`;
  }, [current, groupName]);

  return (
    <>
      <div className="bg-black sticky top-0 z-10">
        {current.external ? (
          <div className="w-full aspect-video flex flex-col items-center justify-center text-center px-6">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-white font-medium">该视频托管于微信视频号</p>
            {wx ? (
              <button
                className="mt-4 bg-brand text-white text-sm font-medium px-6 py-2.5 rounded-full active:opacity-80"
                onClick={() => { if (current.sourceUrl) location.href = current.sourceUrl; }}
              >前往视频号播放</button>
            ) : (
              <>
                <p className="text-white/50 text-xs mt-2 leading-relaxed">请在<b className="text-white/80">微信</b>中打开本页面后点击播放<br />（可把本页链接发送到微信「文件传输助手」再点开）</p>
                {current.sourceUrl && (
                  <button
                    className="mt-3 text-white/70 text-xs border border-white/30 px-4 py-1.5 rounded-full active:opacity-70"
                    onClick={() => navigator.clipboard.writeText(current.sourceUrl!)}
                  >复制视频号链接</button>
                )}
              </>
            )}
          </div>
        ) : (
          <video
            ref={videoRef}
            key={current.id}
            src={current.src}
            poster={current.cover ?? undefined}
            controls
            playsInline
            className="w-full aspect-video"
            controlsList="nodownload"
            onEnded={onEnded}
          />
        )}
      </div>
      <div className="bg-white px-4 py-4">
        <h1 className="text-lg font-bold leading-snug">{current.title}</h1>
        <p className="text-xs text-ink-300 mt-1.5">
          <a href={groupHref} className="text-brand hover:underline">{groupName}</a>
          {!current.external && <><span className="mx-2">·</span><span className="num">{current.duration}</span></>}
          <span className="mx-2">·</span>
          <label className="inline-flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" className="accent-brand-600 align-middle" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
            自动连播
          </label>
        </p>
      </div>
      {items.length > 1 && (
        <div className="bg-white mt-2 px-4 py-3">
          <h2 className="text-sm font-semibold mb-2 text-ink-700">同分组 · 共 {items.length} 个视频</h2>
          <div className="divide-y divide-ink-100">
            {items.map((v) => {
              const playing = v.id === currentId;
              return (
                <button
                  key={v.id}
                  onClick={() => play(v.id)}
                  disabled={playing}
                  className={`w-full flex gap-3 py-2.5 text-left ${playing ? "bg-brand-50/60 -mx-2 px-2 rounded-lg" : "active:bg-ink-50"}`}
                >
                  <div className="w-28 shrink-0 aspect-video rounded-lg bg-ink-100 overflow-hidden relative">
                    {v.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                    {v.external && (
                      <span className="absolute left-1 bottom-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">视频号</span>
                    )}
                    {playing && (
                      <span className="absolute inset-0 bg-black/45 flex items-center justify-center">
                        <span className="text-white text-xs font-medium tracking-wide">▶ 正在播放</span>
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug line-clamp-2 ${playing ? "text-brand-700 font-medium" : ""}`}>
                      <span className="num text-ink-300 mr-1">{v.idx}.</span>{v.title}
                    </p>
                    {v.external
                      ? <p className="text-xs text-brand mt-1">微信内点击播放 →</p>
                      : <p className="text-xs text-ink-300 mt-1 num">{v.duration}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
