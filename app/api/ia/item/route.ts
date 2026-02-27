import { NextRequest } from "next/server";
import { formatDuration } from "@/utils/formatDuration";

const PLAYABLE_FORMATS = new Set([
  "VBR MP3",
  "MP3",
  "64Kbps MP3",
  "128Kbps MP3",
  "256Kbps MP3",
]);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!metaRes.ok) return Response.json({ error: "Metadata fetch failed" }, { status: 502 });

  const meta: any = await metaRes.json();
  const files: any[] = meta?.files || [];
  const md = meta?.metadata || {};

  const tracks = files
    .filter((f) => {
      const fmt = String(f.format || "");
      const name = String(f.name || "");
      if (!name) return false;
      if (name.endsWith(".mp3") === false) return false;
      return PLAYABLE_FORMATS.has(fmt) || fmt.includes("MP3");
    })
    .map((f) => ({
      name: f.name,
      title: f.title || f.name,
      track: f.track,
      length: formatDuration(f.length),
      format: f.format,
      source: f.source,
      url: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(f.name)}`,
    }));

  // Keep deterministic order
  tracks.sort((a, b) => {
    const at = Number(a.track);
    const bt = Number(b.track);
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return at - bt;
    return String(a.name).localeCompare(String(b.name));
  });

  return Response.json({
    identifier: id,
    title: md.title,
    creator: md.creator,
    date: md.date,
    venue: md.venue,
    tracks,
  });
}
