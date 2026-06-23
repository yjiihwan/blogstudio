/**
 * 이미지 파일 저장소 — prod에서는 Railway 볼륨에 저장해 재배포에도 보존한다.
 *
 * 경로 결정(우선순위):
 *   1) STORAGE_DIR env (명시 지정)
 *   2) DATABASE_URL 과 같은 디렉토리의 storage/  → prod: /data/storage (볼륨)
 *   3) <cwd>/.data/storage (로컬 폴백)
 *
 * 파일은 public/ 밖에 저장하고, /storage/<name> URL은 app/storage 라우트가 서빙한다
 * (그래서 볼륨에 있어도 보인다). DB에는 변함없이 "/storage/<name>" 을 저장한다.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { nanoid } from "nanoid";

// 사용 시점(런타임, node)에 계산 — 모듈 로드 시 process.cwd() 호출을 피해
// Edge 번들 경고/리스크를 없앤다.
export function storageDir(): string {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  const dbUrl = process.env.DATABASE_URL?.replace(/^file:/, "").trim();
  if (dbUrl) return path.join(path.dirname(path.resolve(dbUrl)), "storage");
  // DATABASE_URL 미설정 로컬 폴백 — 상대경로(런타임 cwd 기준). process.cwd() 미호출.
  return path.join(".data", "storage");
}

export const STORAGE_URL_PREFIX = "/storage/";

/** 버퍼를 저장하고 DB/URL에 쓸 "/storage/<name>" 경로를 반환. */
export async function saveImageBuffer(
  buffer: Buffer,
  ext: string
): Promise<{ urlPath: string; size: number }> {
  const dir = storageDir();
  await fs.mkdir(dir, { recursive: true });
  const safeExt = (ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const name = `${nanoid(16)}.${safeExt}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return { urlPath: `${STORAGE_URL_PREFIX}${name}`, size: buffer.length };
}

/** "/storage/<name>" URL → 실제 파일 시스템 절대경로 (traversal 차단). */
export function fsPathForUrl(urlPath: string): string | null {
  if (!urlPath.startsWith(STORAGE_URL_PREFIX)) return null;
  const name = path.basename(urlPath); // 디렉토리 traversal 방지
  if (!name || name === "." || name === "..") return null;
  return path.join(storageDir(), name);
}

/** 저장된 이미지 파일 삭제(있으면). 실패는 무시. */
export async function deleteImageFile(urlPath: string | null | undefined): Promise<void> {
  if (!urlPath) return;
  const fp = fsPathForUrl(urlPath);
  if (!fp) return;
  await fs.rm(fp, { force: true }).catch(() => {});
}
