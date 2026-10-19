"use client";

import { useEffect, useRef, useState } from "react";
import { api, contestantImg } from "@/lib/client";
import { Button, Card, Modal, Field, Input, Textarea, Empty, Badge } from "@/components/ui";
import { VoteDetail, ContestantItem } from "./types";
import { ImagePicker } from "@/components/Uploader";
import { useDialogs } from "@/components/ui/dialogs";
import type { ContestantDetail } from "./ResultsTab";

export function ContestantsTab({ vote, reload }: { vote: VoteDetail; reload: () => void }) {
  const { confirm, toast, dialogNode } = useDialogs();
  const [editing, setEditing] = useState<ContestantItem | "new" | null>(null);
  const [transcriptFor, setTranscriptFor] = useState<ContestantItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function del(c: ContestantItem) {
    if (!(await confirm(`确定删除选手「${c.name}」？相关票数数据将一并删除。`, { confirmText: "删除", danger: true }))) return;
    await api(`/api/contestants/${c.id}`, { method: "DELETE" });
    reload();
  }

  async function importCsv(file: File) {
    const Papa = (await import("papaparse")).default;
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data.filter((r) => r[0] && r[0] !== "名称");
        const items = rows.map((r) => ({ name: String(r[0]).trim(), intro: String(r[1] ?? "").trim(), image: String(r[2] ?? "").trim() }));
        if (items.length === 0) { toast("CSV 中没有有效数据"); return; }
        const result = await api<{ imported: number; imageOk: number; imageFail: number }>("/api/contestants/import", { method: "POST", body: JSON.stringify({ voteId: vote.id, items }) });
        setImportOpen(false);
        reload();
        toast(`已导入 ${result.imported} 位选手${result.imageOk + result.imageFail > 0 ? `；照片成功 ${result.imageOk} 张${result.imageFail > 0 ? `、失败 ${result.imageFail} 张（可稍后单独补传）` : ""}` : ""}`);
      },
      error: () => toast("CSV 解析失败"),
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <span className="text-sm text-ink-500">共 {vote.contestants.length} 位选手</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>CSV 批量导入</Button>
          <Button size="sm" onClick={() => setEditing("new")}>+ 添加选手</Button>
        </div>
      </div>
      {vote.contestants.length === 0 ? (
        <Empty text="还没有选手，单个添加或 CSV 批量导入" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-300 border-b border-ink-100">
              <th className="px-5 py-3 font-medium w-16">编号</th>
              <th className="px-3 py-3 font-medium w-16">照片</th>
              <th className="px-3 py-3 font-medium">名称</th>
              <th className="px-3 py-3 font-medium">简介</th>
              <th className="px-3 py-3 font-medium w-36 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {vote.contestants.map((c) => (
              <tr key={c.id} className="hover:bg-ink-50/50">
                <td className="px-5 py-3 num">{c.number}</td>
                <td className="px-3 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={contestantImg(c.image)} alt="" className="w-12 h-12 rounded-lg object-cover" />
                </td>
                <td className="px-3 py-3 font-medium">{c.name}</td>
                <td className="px-3 py-3 text-ink-500 max-w-xs truncate">{c.intro}</td>
                <td className="px-3 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setTranscriptFor(c)}>成绩单</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>编辑</Button>
                  <Button variant="ghost" size="sm" className="hover:text-red-500" onClick={() => del(c)}>删除</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && <ContestantModal vote={vote} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} reload={reload} />}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="CSV 批量导入选手">
        <p className="text-sm text-ink-500 mb-3">CSV 格式：第一列「名称」（必填），第二列「简介」（选填），第三列「照片 URL」（选填，服务端自动下载，失败的可在列表单独补传），不含表头或首行为表头均可。</p>
        <div className="bg-ink-50 rounded-lg p-3 text-xs text-ink-500 mb-4 font-mono">
          名称,简介<br />张三,成都某餐厅<br />李四,某区某单位
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => {
            const blob = new Blob(["﻿名称,简介,照片URL\n张三,成都某餐厅,https://example.com/a.jpg\n李四,某区某单位,"], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "选手导入模板.csv";
            a.click();
          }}>下载模板</Button>
          <Button onClick={() => fileRef.current?.click()}>选择 CSV 文件</Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
        </div>
      </Modal>
      {transcriptFor && <TranscriptModal voteId={vote.id} contestant={transcriptFor} onClose={() => setTranscriptFor(null)} />}
      {dialogNode}
    </Card>
  );
}

function ContestantModal({ vote, item, onClose, reload }: { vote: VoteDetail; item: ContestantItem | null; onClose: () => void; reload: () => void }) {
  const [number, setNumber] = useState(item?.number ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [intro, setIntro] = useState(item?.intro ?? "");
  const [image, setImage] = useState(item?.image ?? "");

  return (
    <Modal open onClose={onClose} title={item ? "编辑选手" : "添加选手"}>
      <div className="grid grid-cols-[80px_1fr] gap-4">
        <Field label="编号"><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="自动" /></Field>
        <Field label="名称" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <Field label="简介"><Textarea rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="单位/地区等" /></Field>
      <Field label="照片"><ImagePicker value={image} onChange={(p) => setImage(p)} label="上传照片" /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button disabled={!name} onClick={async () => {
          if (item) {
            await api(`/api/contestants/${item.id}`, { method: "PUT", body: JSON.stringify({ number: number || undefined, name, intro, image: image || null }) });
          } else {
            await api("/api/contestants", { method: "POST", body: JSON.stringify({ voteId: vote.id, name, intro, image }) });
          }
          onClose();
          reload();
        }}>保存</Button>
      </div>
    </Modal>
  );
}

function TranscriptModal({ voteId, contestant, onClose }: { voteId: string; contestant: ContestantItem; onClose: () => void }) {
  const [data, setData] = useState<ContestantDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<ContestantDetail>(`/api/results/vote/${voteId}/contestant/${contestant.id}`).then(setData).catch((e) => setError((e as Error).message));
  }, [voteId, contestant.id]);
  return (
    <Modal open onClose={onClose} title={`${contestant.number} ${contestant.name} · 各轮成绩单`} width="max-w-2xl">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!data && !error && <p className="text-sm text-ink-300 py-6 text-center">加载中…</p>}
      {data && (
        <div className="space-y-3">
          {data.rounds.length === 0 && <Empty text="还没有轮次" />}
          {data.rounds.map((r) => (
            <div key={r.roundId} className="bg-ink-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{r.roundName}</p>
                {r.participated
                  ? <p className="text-sm num font-bold text-brand-700">轮总分 {r.total}</p>
                  : <Badge>未参赛</Badge>}
              </div>
              {r.participated && (
                <div className="space-y-2">
                  {r.groups.map((g) => (
                    <div key={g.name} className="text-sm">
                      <div className="flex items-baseline gap-x-2">
                        <span className="text-ink-500 w-32 shrink-0">{g.name}（{g.weight}%）</span>
                        <span className="num font-semibold w-14">{g.contribution}</span>
                        <span className="text-xs text-ink-300 num">
                          {g.kind === "vote"
                            ? (g.fixedPoints != null ? `${g.raw}票 × ${g.fixedPoints}分` : `${g.raw}票/${g.participants}人`)
                            : `均分 ${g.raw} · ${g.participants}人`}
                        </span>
                        {r.batch > 0 && <span className="ml-auto text-xs text-ink-300">第{r.batch}批</span>}
                      </div>
                      {g.judges.length > 0 && (
                        <p className="text-xs text-ink-400 num mt-0.5 pl-32">
                          {g.judges.map((j) => `${j.name} ${j.score}（${j.share}）`).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
