import type { MetadataRoute } from 'next';
import { getPublicEntriesForSitemap, getPublicTagTree } from '@/db/queries';
import { absoluteUrl } from '@/lib/site-config';

/**
 * sitemap.xml —— 从数据库生成。
 * lastModified 用条目自己的 updated_at，**不要用 new Date()**，否则每次请求都变、搜索引擎会当成天天更新。
 * 优先级：首页 1.0 / 列表页 0.9 / 标签页 0.8 / 详情页 0.6。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [entries, tagTree] = await Promise.all([getPublicEntriesForSitemap(), getPublicTagTree()]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/tools'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/sites'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/shops'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/tags'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/submit'), changeFrequency: 'monthly', priority: 0.3 },
  ];

  const entryPages: MetadataRoute.Sitemap = entries.map((entry) => ({
    url: absoluteUrl(`/${entry.type === 'site' ? 'sites' : entry.type === 'shop' ? 'shops' : 'tools'}/${entry.slug}`),
    lastModified: new Date(entry.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const tagPages: MetadataRoute.Sitemap = tagTree
    .filter((tag) => tag.dim !== 'private')
    .map((tag) => ({
      url: absoluteUrl(`/tags/${tag.dim}/${tag.slug}`),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

  return [...staticPages, ...tagPages, ...entryPages];
}
