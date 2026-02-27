function toClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatDuration(raw?: string | number | null): string | undefined {
  if (raw == null) return undefined;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return undefined;
    return toClock(raw);
  }

  const value = String(raw).trim();
  if (!value) return undefined;

  // Archive metadata often returns decimal seconds, e.g. "248.33".
  if (/^\d+(\.\d+)?$/.test(value)) {
    const sec = Number(value);
    if (!Number.isFinite(sec) || sec < 0) return undefined;
    return toClock(sec);
  }

  // Already looks like a clock string; keep as-is.
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return value;

  return value;
}
