"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught an error", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#080017] text-white">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6">
          <div className="w-full rounded-xl border border-rose-300/30 bg-rose-600/10 p-5 text-center">
            <h1 className="text-xl font-semibold">App error</h1>
            <p className="mt-2 text-sm text-white/80">
              A critical error occurred. Refresh the app or retry below.
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
      </body>
    </html>
  );
}
