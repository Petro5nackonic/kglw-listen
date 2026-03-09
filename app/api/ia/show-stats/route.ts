import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type IaMetadataFile = {
  name?: string;
  title?: string;
  track?: string;
  length?: string | number;
};

function normalizeSongText(v: string): string {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAudioName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.endsWith(".mp3") ||
    n.endsWith(".flac") ||
    n.endsWith(".ogg") ||
    n.endsWith(".m4a") ||
    n.endsWith(".wav")
  );
}

function audioExtRank(name: string): number {
  const n = name.toLowerCase();
  if (n.endsWith(".flac")) return 1;
  if (n.endsWith(".mp3")) return 2;
  if (n.endsWith(".m4a")) return 3;
  if (n.endsWith(".ogg")) return 4;
  if (n.endsWith(".wav")) return 5;
  return 999;
}

function trackSetRank(fileName: string): number {
  const n = fileName.toLowerCase();
  if (n.includes("edited")) return 1;
  if (n.includes("stereo")) return 2;
  if (n.includes("audience") || n.includes("matrix") || n.includes("soundboard")) return 3;
  if (n.includes("og")) return 10;
  if (n.includes("original")) return 11;
  if (n.includes("4ch") || n.includes("4-ch") || n.includes("4 channel") || n.includes("4-channel")) return 12;
  return 5;
}

function parseTrackNum(t?: string): number {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function parseLengthToSeconds(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  return null;
}

async function fetchMetadataWithTimeout(identifier: string, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (!res.ok) return null;
    return (await res.json()) as { files?: IaMetadataFile[] };
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const identifier = (req.nextUrl.searchParams.get("identifier") || "").trim();
  const boundarySong = (req.nextUrl.searchParams.get("boundarySong") || "").trim();
  const normalizedBoundarySong = normalizeSongText(boundarySong);
  if (!identifier) {
    return Response.json(
      { showLengthSeconds: null, showTrackCount: null, error: "Missing identifier" },
      { status: 400 },
    );
  }

  const metadata =
    (await fetchMetadataWithTimeout(identifier, 5000)) ||
    (await fetchMetadataWithTimeout(identifier, 9000));
  if (!metadata) {
    return Response.json({ showLengthSeconds: null, showTrackCount: null });
  }

  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const audioAll = files.filter((f) => {
    const name = String(f?.name || "");
    return Boolean(name) && isAudioName(name);
  });
  if (audioAll.length === 0) {
    return Response.json({ showLengthSeconds: null, showTrackCount: null });
  }

  const bestSet = Math.min(...audioAll.map((f) => trackSetRank(String(f?.name || ""))));
  const inSet = audioAll.filter((f) => trackSetRank(String(f?.name || "")) === bestSet);
  const bestExt = Math.min(...inSet.map((f) => audioExtRank(String(f?.name || ""))));
  const picked = inSet.filter((f) => audioExtRank(String(f?.name || "")) === bestExt);

  picked.sort((a, b) => {
    const ta = parseTrackNum(a?.track);
    const tb = parseTrackNum(b?.track);
    if (ta !== tb) return ta - tb;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const seen = new Set<string>();
  const orderedTrackTitles: string[] = [];
  let total = 0;
  for (const f of picked) {
    const title = String(f?.title || f?.name || "");
    const lenRaw = String(f?.length || "");
    const key = `${title.toLowerCase()}|${lenRaw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    orderedTrackTitles.push(title);
    const sec = parseLengthToSeconds(f?.length);
    if (sec != null) total += sec;
  }

  const firstTrackTitle = orderedTrackTitles[0] || null;
  const lastTrackTitle =
    orderedTrackTitles.length > 0 ? orderedTrackTitles[orderedTrackTitles.length - 1] : null;
  const firstNorm = normalizeSongText(firstTrackTitle || "");
  const lastNorm = normalizeSongText(lastTrackTitle || "");
  const boundarySongMatch =
    normalizedBoundarySong.length > 0 &&
    ((firstNorm.includes(normalizedBoundarySong) ||
      normalizedBoundarySong.includes(firstNorm)) ||
      (lastNorm.includes(normalizedBoundarySong) ||
        normalizedBoundarySong.includes(lastNorm)));

  return Response.json({
    showLengthSeconds: total > 0 ? total : null,
    showTrackCount: seen.size > 0 ? seen.size : null,
    firstTrackTitle,
    lastTrackTitle,
    boundarySongMatch,
  });
}
