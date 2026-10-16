import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { mimeOf, resolvePrivatePath } from '@/lib/storage';

/**
 * 私密图片的鉴权路由：/api/file/{entryId}/{filename}
 *
 * 三种响应头一个都不能少：
 *   Cache-Control: private, max-age=0, no-store   ← 写成 public 的话 CDN 会把站长看到的图发给所有人
 *   X-Robots-Tag: noindex, nofollow
 *   不登录直接 401（不能 redirect，redirect 会把请求带去登录页而不是拒绝）
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getAdminSession();
  if (!session) {
    return new NextResponse('未登录', { status: 401 });
  }

  const { path: segments } = await params;
  const filePath = resolvePrivatePath(segments);

  if (!filePath) {
    return new NextResponse('路径不合法', { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': mimeOf(filePath),
        'Cache-Control': 'private, max-age=0, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch {
    return new NextResponse('文件不存在', { status: 404 });
  }
}
