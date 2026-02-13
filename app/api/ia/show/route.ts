import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type IaDoc = {
  identifier: string;
  title?: string;
  date?: string;
  downloads?: number | string;
  avg_rating?: number | string;
  num_reviews?: number | string;
};

function parseNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function extractShowDateFromKey(showKey: string): string | null {
  const m = showKey.match(/^(\d{4}-\d{2}-\d{2})\|/);
  return m ? m[1] : null;
}

function sourceHint(identifier: string, title?: string): "SBD" | "AUD" | "MATRIX" | "UNKNOWN" {
  const hay = `${identifier} ${title || ""}`.toLowerCase();
  if (hay.includes("matrix")) return "MATRIX";
  if (hay.includes("sbd")) return "SBD";
  if (hay.includes("aud")) return "AUD";
  return "UNKNOWN";
}

function scoreSource(doc: IaDoc): number {
  const hint = sourceHint(doc.identifier, doc.title);
  const downloads = parseNum(doc.downloads);
  const avg = parseNum(doc.avg_rating);
  const reviews = parseNum(doc.num_reviews);
  const hintBonus = hint === "SBD" ? 3 : hint === "MATRIX" ? 1 : 0;
  return Math.log10(downloads + 1) * 10 + avg * 2 + Math.log10(reviews + 1) + hintBonus;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = sp.get("key");
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });

  const showDate = extractShowDateFromKey(key);
  if (!showDate) return Response.json({ error: "Invalid key" }, { status: 400 });

  // KGLW only
  const q =
    `(collection:(KingGizzardAndTheLizardWizard)` +
    ` OR creator:("King Gizzard & The Lizard Wizard")` +
    ` OR creator:("King Gizzard And The Lizard Wizard"))` +
    ` AND mediatype:(audio)` +
    ` AND (identifier:(*${showDate}*) OR title:(*${showDate}*))`;

  const fields = ["identifier", "title", "date", "downloads", "avg_rating", "num_reviews"];

  const url =
    "https://archive.org/advancedsearch.php" +
    `?q=${encodeURIComponent(q)}` +
    fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
    `&rows=500&page=1&output=json`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return Response.json({ error: "Archive request failed" }, { status: 502 });
  }

  const data: any = await res.json();
  const docs: IaDoc[] = data?.response?.docs || [];

  // Filter down to only sources that match our showKey’s venue slug approximately
  // (we keep it simple: if the showKey venue part appears in identifier or title)
  const venueSlug = key.split("|")[1] || "";
  const sources = docs
    .filter((d) => {
      const hay = `${d.identifier} ${d.title || ""}`.toLowerCase();
      return venueSlug ? hay.includes(venueSlug) || true : true; // keep tolerant
    })
    .map((d) => {
      const hint = sourceHint(d.identifier, d.title);
      const downloads = parseNum(d.downloads);
      const avg_rating = parseNum(d.avg_rating);
      const num_reviews = parseNum(d.num_reviews);
      const score = scoreSource(d);

      return {
        identifier: d.identifier,
        title: d.title || d.identifier,
        hint,
        downloads,
        avg_rating,
        num_reviews,
        score,
      };
    });

  sources.sort((a, b) => b.score - a.score);

  const defaultId = sources[0]?.identifier || null;

  return Response.json({
    key,
    showDate,
    defaultId,
    sources,
  });
}
