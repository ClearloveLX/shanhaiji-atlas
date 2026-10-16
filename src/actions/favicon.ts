'use server';

import { requireAdmin } from '@/lib/auth';
import { putObject } from '@/lib/storage';
import type { ActionResult } from '@/types';

const TIMEOUT_MS = 8000;

/** 从 URL 里取域名 */
function domainOf(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return null;
  }
}

async function download(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; AtlasIconFetcher/1.0)' },
    });

    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) return null;

    return new Uint8Array(buffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓 favicon 并存到自己服务器上。
 * 先试 Google 的 favicon 服务（拿得到 128px 的图），失败就回退站点自己的 /favicon.ico。
 * ★ 抓下来之后**一定**走 putObject 落在 data/uploads/，绝不引用第三方地址（那些链接几天就失效）。
 */
export async function fetchFavicon(entryUrl: string, slug: string): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();

  const domain = domainOf(entryUrl);
  if (!domain) return { ok: false, error: '先填一个合法的链接，再抓图标' };

  const candidates = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    `https://${domain}/favicon.ico`,
  ];

  for (const candidate of candidates) {
    const bytes = await download(candidate);
    if (!bytes) continue;

    try {
      const extension = candidate.endsWith('.ico') ? 'ico' : 'png';
      const url = await putObject({
        kind: 'icons',
        filename: `${slug || domain}.${extension}`,
        buffer: bytes,
        visibility: 'public',
      });
      return { ok: true, data: { url } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '保存图标失败' };
    }
  }

  return { ok: false, error: '没能抓到图标，手动传一张吧' };
}
