import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export const dynamic = "force-dynamic";

const USER_DEFAULT_ARTWORK_PATH =
  "C:\\Users\\jackg\\.cursor\\projects\\c-Users-jackg-Desktop-VibeCoding-KGLW-Listen\\assets\\c__Users_jackg_AppData_Roaming_Cursor_User_workspaceStorage_6e2e14b08574fc0513080e80548d4f84_images_Sticker-7_2x-3c6f12f3-ca74-4c8a-bdc3-b65701c11874.png";

function contentTypeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET() {
  try {
    const bytes = await readFile(USER_DEFAULT_ARTWORK_PATH);
    return new Response(bytes, {
      headers: {
        "Content-Type": contentTypeFromPath(USER_DEFAULT_ARTWORK_PATH),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Fallback artwork file not found.", { status: 404 });
  }
}
