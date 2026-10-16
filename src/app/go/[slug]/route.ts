import { NextResponse, type NextRequest } from 'next/server';
import { getPrivateRedirectEntry, getPublicRedirectEntry } from '@/db/queries';
import { getAdminSession } from '@/lib/auth';
import { recordClick } from '@/lib/clicks';
import { absoluteUrl } from '@/lib/request-origin';
import type { Entry } from '@/db/schema';

/**
 * 外链跳转中间页 /go/{slug}
 *
 * 为什么所有外链都要走这里（见 docs/DATA-MODEL.md 4.1）：
 *   1. 统计准确，且不会被广告拦截器拦住
 *   2. 以后换域名、接联盟链接，不用改任何已经发出去的链接
 *   3. 统一带 nofollow，并可以在这里做「链接是否还活着」的判断
 *   4. 外链挂了有兜底提示页，不会直接给用户一个 404
 *
 * 直接 302，不做「3 秒后自动跳转」的中间页 —— 不让用户等。
 *
 * ★ 私密条目的跳转必须 requireAdmin，否则等于开了一条免登录旁路（docs/PRIVACY.md 六·④）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let entry: Entry | null = await getPublicRedirectEntry(slug);

  if (!entry) {
    // 公开查询拿不到，可能是私密条目（也可能是真不存在）
    const privateEntry = getPrivateRedirectEntry(slug);
    if (privateEntry) {
      const session = await getAdminSession();
      if (session) entry = privateEntry;
    }
  }

  if (!entry) {
    return NextResponse.redirect(absoluteUrl(request, `/go/not-found?from=${encodeURIComponent(slug)}`), 307);
  }

  if (entry.status === 'dead') {
    return NextResponse.redirect(absoluteUrl(request, `/go/gone?from=${encodeURIComponent(slug)}`), 307);
  }

  if (!entry.url) {
    // internal / place 形态没有外链，正常情况下不会有人点进来
    return NextResponse.redirect(absoluteUrl(request, `/go/gone?from=${encodeURIComponent(slug)}`), 307);
  }

  try {
    recordClick(entry.id);
  } catch (error) {
    // 统计失败不能影响跳转
    console.error('[go] 记录点击失败', error);
  }

  const response = NextResponse.redirect(entry.url, 302);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  return response;
}
