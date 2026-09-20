import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/storage-driver";
import { cookies } from "next/headers";
import { sha256 } from "@/lib/codes";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { PlaylistPlayer } from "@/components/PlaylistPlayer";

export const dynamic = "force-dynamic";

function fmtDuration(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export default async function PlayPage({ params }: { params: { code: string; id: string } }) {
  const group = await db.videoGroup.findUnique({
    where: { code: params.code },
    include: { videos: { where: { status: 1, processStatus: "ready" }, orderBy: { sort: "asc" } } },
  });
  if (!group || group.status !== 1) notFound();

  if (group.password) {
    const authed = cookies().get(`vg_auth_${group.code}`)?.value === sha256(`${group.code}|${group.password}|ok`);
    if (!authed) notFound();
  }

  const video = group.videos.find((v) => v.id.toString() === params.id);
  if (!video) notFound();

  const items = await Promise.all(
    group.videos.map(async (v, i) => ({
      id: v.id.toString(),
      idx: i + 1,
      title: v.title,
      duration: fmtDuration(v.duration),
      src: await mediaUrl(v.filePath),
      cover: v.coverPath ? await mediaUrl(v.coverPath) : null,
    }))
  );

  return (
    <PublicShell>
      <PlaylistPlayer items={items} startId={video.id.toString()} groupName={group.name} groupHref={`/v/${group.code}`} />
    </PublicShell>
  );
}
