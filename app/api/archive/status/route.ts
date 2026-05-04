import { loadArchiveDataset } from "@/lib/archive";

const HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
};

export async function GET() {
  const ds = await loadArchiveDataset();
  return Response.json(
    {
      updatedAt: ds?.updatedAt ?? null,
      docCount: ds?.docs?.length ?? 0,
      itemCount: ds ? Object.keys(ds.itemsByIdentifier).length : 0,
    },
    { headers: HEADERS },
  );
}
