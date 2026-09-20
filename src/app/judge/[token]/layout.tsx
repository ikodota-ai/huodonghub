import type { Metadata } from "next";
import { db } from "@/lib/db";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const voter = await db.voter.findUnique({
    where: { token: params.token },
    include: { group: { include: { round: { include: { vote: true } } } } },
  });
  if (!voter) return { title: "评审评分" };
  const vote = voter.group.round.vote;
  return {
    title: `${vote.name} · 评审评分`,
    openGraph: {
      title: `${vote.name} · ${voter.group.round.name}`,
      description: `${voter.group.name}评分通道`,
    },
  };
}

export default function JudgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
