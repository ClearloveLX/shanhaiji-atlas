import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 上传文件的唯一入口。
 * 「目录 ⇄ 访问 URL」的对应关系**全项目只有这一个文件知道**。
 *
 *   public  → data/uploads/public/{kind}/{filename}   →  /media/{kind}/{filename}
 *   private → data/uploads/private/{entryId}/{filename} → /api/file/{entryId}/{filename}
 *
 * 为什么不放 public/：部署方式是「本地构建 → rsync 覆盖 app/」，
 * public/ 每次发布都被整个替换，放进去的上传文件下次发布全丢。
 *
 * 真正的隔离手段是「两个不同的访问出口」，不是两个不同的目录：
 * data/ 整个目录对公网不可见，公开图片靠 /media/* 显式映射出去，
 * 私密图片只能走 /api/file/*（requireAdmin + no-store）。
 */

export type StorageKind = 'icons' | 'qrcodes' | 'covers';
export type StorageVisibility = 'public' | 'private';

export const STORAGE_KINDS: readonly StorageKind[] = ['icons', 'qrcodes', 'covers'];

export const PUBLIC_URL_PREFIX = '/media';
export const PRIVATE_URL_PREFIX = '/api/file';

const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? './data/uploads');
const PUBLIC_DIR = path.join(UPLOAD_DIR, 'public');
const PRIVATE_DIR = path.join(UPLOAD_DIR, 'private');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
};

export function mimeOf(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export type PutObjectInput = {
  kind: StorageKind;
  /** 文件名，跟随条目 slug（figma.png 而不是 www.figma.com.png） */
  filename: string;
  buffer: Uint8Array;
  visibility: StorageVisibility;
  /** visibility='private' 时必填，作为目录名 */
  entryId?: string;
};

function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!base || base.startsWith('.')) {
    throw new Error(`文件名不合法：${filename}`);
  }
  return base;
}

/**
 * 文件名带上内容指纹：`{slug}-{hash8}.png`。
 *
 * ★ 为什么必须这样：`/media/*` 是 `immutable` 长缓存，浏览器不会回源。
 *   如果换了图还沿用同一个文件名，URL 没变 —— 浏览器永远显示旧图，
 *   表现就是「图标换了但没反应」。带上内容哈希，内容一变 URL 就变，缓存自然失效；
 *   内容没变则文件名一样，也不会重复占地方。
 */
function contentAddressed(filename: string, buffer: Uint8Array): string {
  const ext = path.extname(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  return `${stem}-${hash}${ext}`;
}

function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error(`路径片段不合法：${segment}`);
  }
  return cleaned;
}

/** 把 URL 段拼到基目录下，并保证结果没跑出基目录（防目录穿越） */
function resolveInside(baseDir: string, segments: string[]): string | null {
  if (segments.length === 0) return null;

  const decoded: string[] = [];
  for (const segment of segments) {
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return null;
    }
    // 目录穿越、绝对路径、空段一律拒绝
    if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) return null;
    decoded.push(value);
  }

  const resolved = path.resolve(baseDir, ...decoded);
  const prefix = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (!resolved.startsWith(prefix)) return null;
  return resolved;
}

/** 公开图片的读取路由用：/media/{kind}/{filename} */
export function resolvePublicPath(segments: string[]): string | null {
  return resolveInside(PUBLIC_DIR, segments);
}

/** 私密图片的鉴权路由用：/api/file/{entryId}/{filename} */
export function resolvePrivatePath(segments: string[]): string | null {
  return resolveInside(PRIVATE_DIR, segments);
}

/** 写文件，返回可直接放进 <img src> 的 URL */
export async function putObject(input: PutObjectInput): Promise<string> {
  const { kind, filename, buffer, visibility, entryId } = input;
  if (!STORAGE_KINDS.includes(kind)) throw new Error(`未知的 kind：${kind}`);

  const safeName = contentAddressed(sanitizeFilename(filename), buffer);

  if (visibility === 'private') {
    if (!entryId) throw new Error('私密文件必须提供 entryId');
    const dir = path.join(PRIVATE_DIR, sanitizeSegment(entryId));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, safeName), buffer);
    return `${PRIVATE_URL_PREFIX}/${sanitizeSegment(entryId)}/${safeName}`;
  }

  const dir = path.join(PUBLIC_DIR, kind);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), buffer);
  return `${PUBLIC_URL_PREFIX}/${kind}/${safeName}`;
}

/** 从 URL 反解出磁盘路径；不是本项目托管的 URL 返回 null */
export function resolveLocalPath(url: string): string | null {
  const clean = url.split('?')[0].split('#')[0];

  if (clean.startsWith(`${PUBLIC_URL_PREFIX}/`)) {
    return resolvePublicPath(clean.slice(PUBLIC_URL_PREFIX.length + 1).split('/'));
  }
  if (clean.startsWith(`${PRIVATE_URL_PREFIX}/`)) {
    return resolvePrivatePath(clean.slice(PRIVATE_URL_PREFIX.length + 1).split('/'));
  }
  return null;
}

export async function deleteObject(url: string): Promise<void> {
  const filePath = resolveLocalPath(url);
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    // 文件本来就不在，当作删除成功
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export const storagePaths = { UPLOAD_DIR, PUBLIC_DIR, PRIVATE_DIR } as const;
