'use server';

import { requireAdmin } from '@/lib/auth';
import { putObject, STORAGE_KINDS, type StorageKind, type StorageVisibility } from '@/lib/storage';
import { looksLikeSvg, sanitizeSvg, SVG_MIME } from '@/lib/svg';
import type { ActionResult } from '@/types';

/** 允许上传的图片类型与大小 */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/avif'];
const MAX_SIZE = 8 * 1024 * 1024;

/** SVG 存下来必须带 .svg 后缀：Content-Type 是按后缀推的，存成 .png 浏览器就不渲染了 */
function withSvgExtension(filename: string): string {
  return /\.svg$/i.test(filename) ? filename : `${filename.replace(/\.[a-z0-9]+$/i, '')}.svg`;
}

/**
 * 图片上传的唯一入口（图标 / 二维码 / 封面）。
 * 一律走 src/lib/storage.ts 落到 data/uploads/，**绝不写进 public/**（部署会整个覆盖）。
 * 二维码上传后由后台视为原始清晰度保存，不做统一压缩（微信识别对清晰度敏感）。
 *
 * SVG 走单独的通道：读成文本 → 洗掉脚本能力（见 src/lib/svg.ts）→ 原样存。
 * 不清洗就直接落盘的话，`/media/icons/x.svg` 是一个能执行脚本的同源文档。
 */
export async function uploadImage(formData: FormData): Promise<ActionResult<{ url: string; cleaned?: boolean }>> {
  await requireAdmin();

  const file = formData.get('file');
  const kindRaw = String(formData.get('kind') ?? 'icons');
  const visibilityRaw = String(formData.get('visibility') ?? 'public');
  const entryId = formData.get('entryId');
  const filenameInput = formData.get('filename');

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '没有选择文件' };
  }

  if (file.size > MAX_SIZE) {
    return { ok: false, error: '文件太大，请压缩到 8MB 以内' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: `不支持的格式：${file.type || '未知'}，请用 PNG / JPG / WebP / SVG` };
  }

  if (!STORAGE_KINDS.includes(kindRaw as StorageKind)) {
    return { ok: false, error: `未知的图片分类：${kindRaw}` };
  }

  const visibility: StorageVisibility = visibilityRaw === 'private' ? 'private' : 'public';

  if (visibility === 'private' && typeof entryId !== 'string') {
    return { ok: false, error: '私密图片必须指定条目 id' };
  }

  const fallbackName = file.name || 'image.png';
  const rawName = typeof filenameInput === 'string' && filenameInput.trim() ? filenameInput.trim() : fallbackName;

  try {
    let buffer = new Uint8Array(await file.arrayBuffer());
    let filename = rawName;
    let cleaned: boolean | undefined;

    if (file.type === SVG_MIME) {
      const text = new TextDecoder().decode(buffer);
      if (!looksLikeSvg(text)) {
        return { ok: false, error: '这个文件不是有效的 SVG（里面找不到 <svg>）' };
      }

      const result = sanitizeSvg(text);
      if (!looksLikeSvg(result.svg)) {
        return { ok: false, error: '这个 SVG 洗完之后就空了，换一个文件吧' };
      }

      buffer = new TextEncoder().encode(result.svg);
      filename = withSvgExtension(rawName);
      cleaned = result.cleaned;
    }

    const url = await putObject({
      kind: kindRaw as StorageKind,
      filename,
      buffer,
      visibility,
      entryId: visibility === 'private' && typeof entryId === 'string' ? entryId : undefined,
    });

    return { ok: true, data: { url, cleaned } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '上传失败' };
  }
}
