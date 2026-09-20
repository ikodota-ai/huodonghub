import type { Metadata } from "next";
import { db } from "@/lib/db";

// 分享卡片：微信/QQ 等取 title 与 og 标签（完整自定义需 JS-SDK，见 doc backlog）
export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const round = await db.voteRound.findUnique({ where: { code: params.code }, include: { vote: true } });
  if (!round) return { title: "投票" };
  const base = process.env.BASE_URL || "";
  const description = `${round.vote.name} · ${round.name}，扫码参与投票`;
  const cover = round.vote.cover;
  const coverUrl = cover ? (cover.startsWith("http") ? cover : `${base}/api/media/${cover}`) : null;
  return {
    title: `${round.vote.name} · 投票`,
    description,
    openGraph: {
      title: `${round.vote.name} · ${round.name}`,
      description,
      images: coverUrl ? [coverUrl] : [],
    },
  };
}

export default function VoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
