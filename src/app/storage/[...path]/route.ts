import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import nodePath from "node:path";
import { storageDir } from "@/lib/storage";

// 볼륨(/data/storage)에 저장된 이미지를 /storage/<name> 으로 서빙한다.
// (public/ 밖에 있어 Next 정적 서빙이 안 되므로 이 라우트가 대신 읽어 보낸다.)
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segs } = await params;
  const name = nodePath.basename((segs ?? []).join("/")); // traversal 차단
  if (!name) return new Response("Not found", { status: 404 });

  const dir = storageDir();
  const filePath = nodePath.join(dir, name);
  if (!filePath.startsWith(dir)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const type = MIME[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
