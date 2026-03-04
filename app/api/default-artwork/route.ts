export const dynamic = "force-dynamic";

export async function GET() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a1050" />
      <stop offset="100%" stop-color="#0e0820" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)" />
  <circle cx="256" cy="256" r="132" fill="none" stroke="#ffffff33" stroke-width="18" />
  <circle cx="256" cy="256" r="34" fill="#ffffff55" />
  <path d="M112 410 C 175 346, 337 346, 400 410" fill="none" stroke="#ffffff26" stroke-width="14" />
</svg>`.trim();

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
