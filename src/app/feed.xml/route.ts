import { getPublicLatest } from '@/db/queries';
import { absoluteUrl, siteConfig } from '@/lib/site-config';

/** XML 转义：标题和简介里出现 & < > 是常事 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RSS 2.0：最新 30 条公开收录（私密与不列出的一律不进 feed） */
export async function GET() {
  const entries = await getPublicLatest(30);

  const items = entries
    .map((entry) => {
      const link = absoluteUrl(
        `/${entry.type === 'site' ? 'sites' : entry.type === 'shop' ? 'shops' : 'tools'}/${entry.slug}`,
      );
      const pubDate = new Date(entry.createdAt).toUTCString();

      return [
        '    <item>',
        `      <title>${escapeXml(entry.name)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <description>${escapeXml(entry.summary)}</description>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${siteConfig.fullName} · 最新收录`)}</title>
    <link>${escapeXml(absoluteUrl('/'))}</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(absoluteUrl('/feed.xml'))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=600',
    },
  });
}
