import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/storage-driver";
import { cookies } from "next/headers";
import { sha256 } from "@/lib/codes";
import Link from "next/link";
import { PasswordGate, GroupShareButton } from "@/components/public-widgets";
import { PublicShell } from "@/components/PublicShell";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// 分享卡片（微信/QQ 等取 title 与 og 标签）
export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const group = await db.videoGroup.findUnique({ where: { code: params.code } });
  if (!group) return { title: "视频合集" };
  const base = process.env.BASE_URL || "";
  const coverRel = group.cover || (await db.video.findFirst({ where: { groupId: group.id, status: 1, processStatus: "ready" }, orderBy: { sort: "asc" } }))?.coverPath;
  const coverUrl = coverRel ? `${base}${await mediaUrl(coverRel)}` : null;
  const description = group.description || `共 ${await db.video.count({ where: { groupId: group.id, status: 1, processStatus: "ready" } })} 个视频`;
  return {
    title: group.name,
    description,
    openGraph: {
      title: group.name,
      description,
      images: coverUrl ? [coverUrl] : [],
    },
  };
}

function fmtDuration(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export default async function GroupPage({ params }: { params: { code: string } }) {
  const group = await db.videoGroup.findUnique({
    where: { code: params.code },
    include: { videos: { where: { status: 1, processStatus: "ready" }, orderBy: { sort: "asc" } } },
  });

  if (!group || group.status !== 1) {
    return (
      <PublicShell>
        <div className="py-24 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-ink-500">内容暂未开放</p>
        </div>
      </PublicShell>
    );
  }

  if (group.password) {
    const authed = cookies().get(`vg_auth_${group.code}`)?.value === sha256(`${group.code}|${group.password}|ok`);
    if (!authed) return <PasswordGate code={group.code} name={group.name} />;
  }

  const coverUrl = group.cover ? await mediaUrl(group.cover) : group.videos[0]?.coverPath ? await mediaUrl(group.videos[0].coverPath) : null;

  const items = await Promise.all(
    group.videos.map(async (v, i) => ({
      id: v.id.toString(),
      idx: i + 1,
      title: v.title,
      duration: fmtDuration(v.duration),
      cover: v.coverPath ? await mediaUrl(v.coverPath) : null,
    }))
  );

  return (
    <PublicShell>
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="w-full aspect-video object-cover" />
      )}
      <div className="px-4 pt-4 pb-2 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold leading-snug">{group.name}</h1>
            <p className="text-sm text-ink-300 mt-1">共 {items.length} 个视频</p>
          </div>
          <GroupShareButton name={group.name} count={items.length} />
        </div>
        {group.description && <p className="text-sm text-ink-500 mt-2">{group.description}</p>}
      </div>
      <div className="bg-white mt-2 divide-y divide-ink-100">
        {items.length === 0 && <p className="py-16 text-center text-ink-300 text-sm">内容准备中</p>}
        {items.map((v) => (
          <Link key={v.id} href={`/v/${group.code}/play/${v.id}`} className="flex gap-3 p-3 active:bg-ink-50">
            <span className="text-lg text-ink-300 num w-6 shrink-0 pt-8">{v.idx}</span>
            <div className="w-36 shrink-0 aspect-video rounded-lg bg-ink-100 overflow-hidden">
              {v.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
              )}
            </div>
            <div className="flex-1 min-w-0 py-1">
              <p className="text-[15px] leading-snug line-clamp-2">{v.title}</p>
              <p className="text-xs text-ink-300 mt-1.5 num">{v.duration}</p>
            </div>
          </Link>
        ))}
      </div>
    </PublicShell>
  );
}
