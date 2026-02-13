"use client";

import { use, useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/components/player/store";

type Track = { title: string; url: string; length?: string; track?: string; name?: string };

type ShowSource = {
  identifier: string;
  title: string;
  hint: string;
  downloads: number;
  avg_rating: number;
  num_reviews: number;
  score: number;
};

export default function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const showKey = decodeURIComponent(id);

  const { setQueue } = usePlayer();

  const [sources, setSources] = useState<ShowSource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [meta, setMeta] = useState<any>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const showDate = useMemo(() => showKey.split("|")[0] || "Unknown date", [showKey]);

  // Load sources for this showKey
  useEffect(() => {
    let alive = true;
    setLoadingSources(true);

    fetch(`/api/ia/show?key=${encodeURIComponent(showKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const srcs: ShowSource[] = d.sources || [];
        setSources(srcs);
        setSelectedId(d.defaultId || (srcs[0]?.identifier ?? null));
      })
      .finally(() => alive && setLoadingSources(false));

    return () => {
      alive = false;
    };
  }, [showKey]);

  // Load tracks for selected source
  useEffect(() => {
    if (!selectedId) return;

    let alive = true;
    setLoadingTracks(true);
    setMeta(null);

    fetch(`/api/ia/item?id=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMeta(d);
      })
      .finally(() => alive && setLoadingTracks(false));

    return () => {
      alive = false;
    };
  }, [selectedId]);

  const tracks: Track[] = Array.isArray(meta?.tracks) ? meta.tracks : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur text-white">
        <div className="text-sm text-white/60">Show</div>
        <div className="text-2xl font-semibold">{showDate}</div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-white/70">
            {loadingSources ? "Loading sources…" : `${sources.length} source${sources.length === 1 ? "" : "s"}`}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60">Source</div>
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loadingSources || sources.length === 0}
            >
              {sources.map((s) => (
                <option key={s.identifier} value={s.identifier}>
                  {s.hint} · {s.downloads ? `${s.downloads} dl` : "no dl"} · {s.identifier}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
            onClick={() => tracks.length && setQueue(tracks, 0)}
            disabled={tracks.length === 0}
          >
            Play all
          </button>
        </div>
      </div>

      {loadingTracks && <div className="text-sm text-white/60">Loading tracks…</div>}

      {!loadingTracks && tracks.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          No playable tracks for this source.
        </div>
      )}

      {tracks.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          {tracks.map((t, i) => (
            <div key={t.url || `${i}`} className="flex items-center justify-between gap-3 border-b border-white/10 p-3 last:border-b-0">
              <div className="min-w-0">
                <div className="truncate font-medium text-white">
                  {t.track ? `${t.track}. ` : ""}
                  {t.title}
                </div>
                <div className="text-xs text-white/60">{t.length ? `Length: ${t.length}` : ""}</div>
              </div>

              <button
                className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
                onClick={() => setQueue(tracks, i)}
              >
                Play
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
