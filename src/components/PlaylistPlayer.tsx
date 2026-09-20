"use client";

import { useEffect, useRef, useState } from "react";

export interface PlaylistItem {
  id: string;
  idx: number;
  title: string;
  duration: string;
  src: string;
  cover: string | null;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const current = items.find((v) => v.id === currentId) ?? items[0];

  function play(id: string, autoplay = true) {
    const v = items.find((x) => x.id === id);
    if (!v || id === currentId) return;
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
    const next = items[idx + 1];
    if (next) play(next.id);
  }

  useEffect(() => {
    document.title = `${current.title} · ${groupName}`;
  }, [current, groupName]);

  return (
    <>
      <div className="bg-black sticky top-0 z-10">
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
      </div>
      <div className="bg-white px-4 py-4">
        <h1 className="text-lg font-bold leading-snug">{current.title}</h1>
        <p className="text-xs text-ink-300 mt-1.5">
          <a href={groupHref} className="text-brand hover:underline">{groupName}</a>
          <span className="mx-2">·</span><span className="num">{current.duration}</span>
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
                    <p className="text-xs text-ink-300 mt-1 num">{v.duration}</p>
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
