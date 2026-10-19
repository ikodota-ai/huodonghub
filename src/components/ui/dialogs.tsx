"use client";

import React, { useCallback, useRef, useState } from "react";
import { Button, Input, Modal } from "@/components/ui";

// 统一的应用内对话框：替代浏览器原生 confirm()/prompt()/alert()
// 用法：const { confirm, prompt, toast, dialogNode } = useDialogs();
//   if (!(await confirm("确定删除？", { danger: true, confirmText: "删除" }))) return;
//   const name = await prompt("轮次名称", "第一轮", { title: "新增轮次" });
//   toast("已保存");
// JSX 中渲染一次 {dialogNode} 即可。

interface ConfirmOptions { title?: string; confirmText?: string; danger?: boolean }
interface PromptOptions { title?: string; confirmText?: string; placeholder?: string; password?: boolean }

export function useDialogs() {
  const [confirmState, setConfirmState] = useState<{ message: string; opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const [promptState, setPromptState] = useState<{ message: string; opts: PromptOptions; resolve: (v: string | null) => void } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastId = useRef(0);

  const confirm = useCallback((message: string, opts: ConfirmOptions = {}) =>
    new Promise<boolean>((resolve) => setConfirmState({ message, opts, resolve })), []);

  const prompt = useCallback((message: string, def = "", opts: PromptOptions = {}) =>
    new Promise<string | null>((resolve) => { setPromptValue(def); setPromptState({ message, opts, resolve }); }), []);

  const toast = useCallback((message: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list, { id, message }]);
    // 时长随文字长度，长文案（如导入结果汇总）留足阅读时间
    const ms = Math.min(2200 + message.length * 60, 6000);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), ms);
  }, []);

  function closeConfirm(v: boolean) { confirmState?.resolve(v); setConfirmState(null); }
  function closePrompt(v: string | null) { promptState?.resolve(v); setPromptState(null); }

  const dialogNode = (
    <>
      <Modal open={!!confirmState} onClose={() => closeConfirm(false)} title={confirmState?.opts.title ?? "请确认"} width="max-w-sm">
        <p className="text-sm text-ink-700 whitespace-pre-line leading-relaxed">{confirmState?.message}</p>
        <div className="flex justify-end gap-2 mt-6">
          {/* 危险操作不自动聚焦确认键，防回车误触发 */}
          <Button variant="secondary" autoFocus={!!confirmState?.opts.danger} onClick={() => closeConfirm(false)}>取消</Button>
          <Button variant={confirmState?.opts.danger ? "danger" : "primary"} autoFocus={!confirmState?.opts.danger} onClick={() => closeConfirm(true)}>
            {confirmState?.opts.confirmText ?? "确定"}
          </Button>
        </div>
      </Modal>
      <Modal open={!!promptState} onClose={() => closePrompt(null)} title={promptState?.opts.title ?? "请输入"} width="max-w-sm">
        <form onSubmit={(e) => { e.preventDefault(); closePrompt(promptValue.trim() === "" ? null : promptValue.trim()); }}>
          <p className="text-sm text-ink-500 mb-3">{promptState?.message}</p>
          <Input
            autoFocus
            type={promptState?.opts.password ? "password" : "text"}
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            placeholder={promptState?.opts.placeholder}
          />
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" type="button" onClick={() => closePrompt(null)}>取消</Button>
            <Button type="submit">{promptState?.opts.confirmText ?? "确定"}</Button>
          </div>
        </form>
      </Modal>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="bg-ink-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lift text-center">{t.message}</div>
        ))}
      </div>
    </>
  );

  return { confirm, prompt, toast, dialogNode };
}
