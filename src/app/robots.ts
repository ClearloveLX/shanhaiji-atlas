import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site-config';

/**
 * robots.txt：允许抓取全部，但后台、站长区、接口和跳转中间页不进索引。
 * /me 和 /admin 另有响应头兜底（noindex, nofollow）。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/me', '/api', '/login', '/go/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
