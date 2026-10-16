import { NextResponse } from 'next/server';
import { searchPublicEntries } from '@/db/queries';

/**
 * ⌘K 命令面板用的轻量搜索接口：只返回 id / name / type / slug，最多 20 条。
 * 为什么用接口而不是「把全部条目传给客户端本地过滤」：
 *   条目到几千条时，全量精简列表也会接近 200KB，且每次打开面板都要为它付出首屏成本；
 *   这个接口一次只回几 KB，还能复用服务端的排序权重（名称命中优先于标签命中）。
 * 走 getPublic* 那条线，只返回公开条目，不需要鉴权。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get('q') ?? '').trim();

  if (!keyword) {
    return NextResponse.json({ items: [] });
  }

  const hits = await searchPublicEntries(keyword, 20);

  return NextResponse.json({
    items: hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      type: hit.type,
      slug: hit.slug,
      summary: hit.summary,
    })),
  });
}
