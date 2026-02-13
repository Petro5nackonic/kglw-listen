"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ShowItem = {
  showKey: string;
  showDate: string; // YYYY-MM-DD
  title: string;
  defaultId: string;
  sourcesCount: number;
  artwork?: string;
};

function yearFromShowDate(showDate: string) {
  const m = showDate?.match(/^(\d{4})-/);
  return m ? m[1] : null;
}

export default function HomePage() {
  const [items, setItems] = useState<ShowItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [yearFilter, setYearFilter] = useState<string>("All");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(
    async (p: number) => {
      if (loading) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/ia/shows?page=${p}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Shows API failed: ${res.status}`);
        const data = await res.json();

        const next: ShowItem[] = Array.isArray(data.items) ? data.items : [];

        setItems((prev) => {
          const map = new Map(prev.map((x) => [x.showKey, x]));
          for (const it of next) map.set(it.showKey, it);
          return Array.from(map.values());
        });

        setHasMore(Boolean(data.hasMore));
        setPage(p);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load shows");
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (loading) return;
        if (!hasMore) return;
        loadPage(page + 1);
      },
      { root: null, rootMargin: "900px 0px", threshold: 0 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadPage, loading, page]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => Date.parse(b.showDate) - Date.parse(a.showDate));
  }, [items]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const it of sorted) {
      const y = yearFromShowDate(it.showDate);
      if (y) years.add(Number(y));
    }
    const arr = Array.from(years).filter(Number.isFinite).sort((a, b) => b - a);
    return ["All", ...arr.map(String)];
  }, [sorted]);

  const filtered = useMemo(() => {
    if (yearFilter === "All") return sorted;
    return sorted.filter((it) => yearFromShowDate(it.showDate) === yearFilter);
  }, [sorted, yearFilter]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold text-white">Shows</h1>
        <div className="text-sm text-white/60">Newest → Oldest</div>
      </div>

      {/* Quick filter pills */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium text-white/60">Quick Filter:</div>
        <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {yearOptions.map((y) => {
            const active = yearFilter === y;
            return (
              <button
                key={y}
                onClick={() => setYearFilter(y)}
                className={[
                  "whitespace-nowrap rounded-full px-3 py-1 text-sm border transition",
                  active
                    ? "bg-white/20 text-white border-white/20"
                    : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {y}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((it) => {
          const thumb = it.artwork || `https://archive.org/services/img/${encodeURIComponent(it.defaultId)}`;

          return (
            <Link
              key={it.showKey}
              href={`/show/${encodeURIComponent(it.showKey)}`}
              className="group block rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur hover:bg-white/10"
            >
              <div className="flex gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white/60">King Gizzard &amp; The Lizard Wizard</div>
                  <div className="text-xl font-semibold text-white">{it.showDate}</div>
                  <div className="truncate text-sm text-white/70">{it.title}</div>
                  <div className="mt-1 text-xs text-white/50">
                    {it.sourcesCount} source{it.sourcesCount === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="flex items-center text-white/50 group-hover:text-white">→</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Sentinel (infinite scroll) */}
      <div ref={sentinelRef} className="h-10" />

      <div className="py-6 text-center text-sm text-white/60">
        {yearFilter !== "All"
          ? hasMore
            ? loading
              ? "Loading…"
              : "Tip: switch back to All to keep infinite scrolling."
            : "You’ve reached the end."
          : loading
          ? "Loading…"
          : hasMore
          ? ""
          : "You’ve reached the end."}
      </div>
    </div>
  );
}
