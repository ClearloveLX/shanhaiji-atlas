import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { mimeOf, resolvePublicPath } from '@/lib/storage';

/**
 * 公开图片的兜底路由：/media/{kind}/{filename}
 * 本地开发没有 Caddy，靠它把 data/uploads/public 里的图送出去。
 * 生产环境 Caddy 的 `handle /media/*` 会抢先接管，这个路由不会执行。
 * 只读 public 子目录，解析后的路径必须以它开头，否则 400。
 *
 * ⚠️ 这里对 .svg 加的那些响应头，Caddy 那边**必须也写一遍**（见 Caddyfile 的
 *    `handle /media/*`）。只在本地生效的安全头等于没有 —— 曾经就踩过这个坑。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const filePath = resolvePublicPath(segments);

  if (!filePath) {
    return new NextResponse('路径不合法', { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    const contentType = mimeOf(filePath);

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    // SVG 是唯一「能被当文档直接打开、里面还能跑脚本」的图片格式。
    // 上传时已经洗过一遍（src/lib/svg.ts），这里再加一道 sandbox 兜底：
    // 万一有漏网的，直接访问这个地址也执行不了任何东西。
    // ⚠️ 生产环境 /media 由 Caddy 直接读盘，不走这个路由 ——
    //    Caddyfile 的 `handle /media/*` 里有一份一模一样的头，改这里要同步改那边。
    if (contentType === 'image/svg+xml') {
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    return new NextResponse(new Uint8Array(file), { headers });
  } catch {
    return new NextResponse('文件不存在', { status: 404 });
  }
}
