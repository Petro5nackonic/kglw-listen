import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { spawn } from "node:child_process";
import { join } from "node:path";

const NO_STORE = {
  "Cache-Control": "no-store",
};

function runSyncScript(): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const script = join(process.cwd(), "scripts", "syncArchive.ts");
    const child = spawn("npx", ["tsx", script], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.on("close", (code) => resolve({ code, stderr }));
    child.on("error", (err) => {
      resolve({ code: 1, stderr: String(err) });
    });
  });
}

type RevalidateBody = {
  // If present, call revalidateTag for each tag. See tag constants in
  // lib/archive.ts and app/api/ia/shows/route.ts.
  tags?: unknown;
  // If present, call revalidatePath for each path (e.g. "/", "/playlists/x").
  paths?: unknown;
  // If true (or when no tags/paths provided), also run the full archive sync.
  sync?: unknown;
};

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0);
}

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET || process.env.ARCHIVE_SYNC_SECRET;
  if (!secret) {
    return Response.json(
      { error: "REVALIDATE_SECRET not configured" },
      { status: 503, headers: NO_STORE },
    );
  }
  const provided = req.headers.get("x-revalidate-secret");
  if (provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: RevalidateBody = {};
  try {
    const raw = await req.text();
    if (raw.trim().length > 0) {
      body = JSON.parse(raw) as RevalidateBody;
    }
  } catch {
    // fall through: empty body is the legacy full-sync behavior.
  }

  const tags = toStringArray(body.tags);
  const paths = toStringArray(body.paths);
  const wantsSync =
    body.sync === true ||
    body.sync === "true" ||
    (tags.length === 0 && paths.length === 0);

  // Next.js 16 requires a cache-life profile; "max" = keep the refreshed
  // entry for the longest configured TTL (our per-fetch revalidate: N wins
  // anyway because it's the more specific control).
  const REVALIDATE_PROFILE = "max";
  for (const tag of tags) {
    try {
      revalidateTag(tag, REVALIDATE_PROFILE);
    } catch {
      // Ignore tags that were never registered — still a success.
    }
  }
  for (const path of paths) {
    try {
      revalidatePath(path, "page");
    } catch {
      // Ignore invalid paths — still a success.
    }
  }

  if (!wantsSync) {
    return Response.json(
      { ok: true, revalidated: { tags, paths } },
      { headers: NO_STORE },
    );
  }

  const result = await runSyncScript();
  if (result.code !== 0) {
    return Response.json(
      { ok: false, error: "Sync failed", detail: result.stderr.slice(0, 2000) },
      { status: 500, headers: NO_STORE },
    );
  }
  return Response.json(
    { ok: true, synced: true, revalidated: { tags, paths } },
    { headers: NO_STORE },
  );
}
