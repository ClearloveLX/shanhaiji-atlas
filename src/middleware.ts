import { NextResponse, type NextRequest } from 'next/server';
import { absoluteUrl } from '@/lib/request-origin';

/**
 * 保护 /admin 与 /me。
 *
 * ⚠️ 这里**不能连数据库**：middleware 跑在 Edge runtime，
 * 而 better-sqlite3 是原生模块，加载不起来。
 * 所以这里只看会话 cookie 在不在，真正的鉴权由每个页面 / Action 里的
 * requireAdmin() 完成（双保险，见 docs/PRIVACY.md 铁律 2）。
 *
 * /me 下所有响应额外带 noindex + no-store：私密内容绝不能被任何缓存留住。
 *
 * ⚠️ 跳转 URL 必须用 absoluteUrl() 拼，**不能用 request.url** ——
 *    生产环境只监听 127.0.0.1:4000，request.url 的 origin 是 localhost:4000，
 *    直接拿它做 307，访客会被送去访问他自己机器上的 localhost。
 *    完整原理见 src/lib/request-origin.ts。
 */

const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (!hasSession) {
    const target = `/login?from=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(absoluteUrl(request, target));
  }

  const response = NextResponse.next();

  if (pathname === '/me' || pathname.startsWith('/me/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'private, max-age=0, no-store');
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/admin', '/me/:path*', '/me'],
};
