"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Item = { identifier: string; title: string; showDate?: string | null; date?: string };

function archiveThumb(identifier: string) {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

function showDateFromIdentifier(identifier: string) {
  const m = identifier.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "Unknown date";
}

export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageRef = useRef(1);
  const seenRef = useRef(new Set<string>());

  // refs so our scroll handler always sees current values
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  async function loadNext() {
    if (loadingRef.current || !hasMoreRef.current) return;

    setLoading(true);
    setError(null);

    const p = pageRef.current;

    try {
      const res = await fetch(`/api/ia/shows?page=${p}`, { cache: "no-store" });
      const data = await res.json();

      const incoming: Item[] = data.items || [];
      const deduped = incoming.filter((it) => {
        if (seenRef.current.has(it.identifier)) return false;
        seenRef.current.add(it.identifier);
        return true;
      });

      setItems((prev) => [...prev, ...deduped]);
      setHasMore(Boolean(data.hasMore));

      pageRef.current = p + 1;
    } catch (e: any) {
      setError(e?.message || "Failed to load shows");
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scroll-based infinite load
  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        // distance from bottom
        const scrollY = window.scrollY || window.pageYOffset;
        const viewport = window.innerHeight;
        const full = document.documentElement.scrollHeight;

        const nearBottom = scrollY + viewport >= full - 900; // 900px threshold
        if (nearBottom) loadNext();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[calc(100vh-6rem)] pb-28">
      {/* Background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.25),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(79,70,229,0.25),_transparent_55%),linear-gradient(180deg,_#05010b,_#05010b)]" />

      <div className="flex items-center justify-between py-3">
        <div className="text-2xl font-bold tracking-tight text-white">Shows</div>
        <div className="text-sm text-white/60">Newest → Oldest</div>
      </div>

      <div className="space-y-3 pb-6">
        {items.map((it) => (
          <Link key={it.identifier} href={`/show/${encodeURIComponent(it.identifier)}`} className="group block">
            <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur hover:bg-white/10 transition">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={archiveThumb(it.identifier)} alt="" className="h-full w-full object-cover" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs text-white/60">King Gizzard &amp; The Lizard Wizard</div>
<div className="truncate text-lg font-semibold text-white">
  {it.showDate || "Unknown date"}
</div>
                <div className="truncate text-sm text-white/60">{it.title}</div>
              </div>

              <div className="self-center text-white/40 group-hover:text-white/60 transition">→</div>
            </div>
          </Link>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && <div className="py-6 text-center text-sm text-white/60">Loading…</div>}

      {!hasMore && !loading && items.length > 0 && (
        <div className="py-6 text-center text-sm text-white/40">You’ve reached the end.</div>
      )}

      {/* Optional manual fallback button */}
      {hasMore && !loading && (
        <div className="py-6 text-center">
          <button
            onClick={loadNext}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
