"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary caught an error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-6 text-white">
      <div className="w-full rounded-xl border border-rose-300/30 bg-rose-600/10 p-5 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-white/80">
          The page failed to load. Try again, and if this keeps happening we can investigate.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-white/15 px-4 py-2 text-sm hover:bg-white/25"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
