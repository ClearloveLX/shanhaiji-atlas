import type { Metadata } from 'next';
import { absoluteUrl, siteConfig } from '@/lib/site-config';
import { listSegment } from '@/lib/tags';
import type { Entry } from '@/db/schema';

/**
 * SEO：统一的 Metadata 构造 + JSON-LD 生成器。
 * 所有 URL 都用 NEXT_PUBLIC_SITE_URL 拼，不带尾斜杠。
 */

export function ogImageUrl(params: { title: string; subtitle?: string }): string {
  const search = new URLSearchParams({ title: params.title });
  if (params.subtitle) search.set('subtitle', params.subtitle);
  return `/og?${search.toString()}`;
}

export function buildMetadata({
  title,
  description,
  path,
  image,
  type = 'website',
  noIndex = false,
}: {
  title?: string;
  description?: string;
  path: string;
  image?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  const ogImage = image ?? ogImageUrl({ title: title ?? siteConfig.fullName, subtitle: description ?? siteConfig.slogan });

  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: title ? `${title} · ${siteConfig.fullName}` : siteConfig.fullName,
      description,
      url,
      siteName: siteConfig.fullName,
      locale: 'zh_CN',
      type,
      images: [{ url: absoluteUrl(ogImage), width: 1200, height: 630, alt: title ?? siteConfig.fullName }],
    },
    twitter: {
      card: 'summary_large_image',
      title: title ? `${title} · ${siteConfig.fullName}` : siteConfig.fullName,
      description,
      images: [absoluteUrl(ogImage)],
    },
  };
}

/* ────────────────────────── JSON-LD ────────────────────────── */

/** JSON-LD 的类型别名，注入组件在 src/components/layout/JsonLd.tsx */
export type JsonLdValue = Record<string, unknown>;

export function jsonLdWebSite(): JsonLdValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.fullName,
    alternateName: siteConfig.nameEn,
    url: absoluteUrl('/'),
    description: siteConfig.description,
    inLanguage: 'zh-CN',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${absoluteUrl('/search')}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

const SCHEMA_TYPE_BY_ENTRY: Record<string, string> = {
  tool: 'SoftwareApplication',
  site: 'WebSite',
  code: 'SoftwareSourceCode',
  shop: 'Store',
};

export function jsonLdEntry(entry: Pick<Entry, 'type' | 'name' | 'nameEn' | 'summary' | 'slug' | 'url' | 'createdAt'>): JsonLdValue {
  const segment = listSegment(entry.type);

  return {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE_BY_ENTRY[entry.type] ?? 'Thing',
    name: entry.name,
    ...(entry.nameEn ? { alternateName: entry.nameEn } : {}),
    description: entry.summary,
    url: absoluteUrl(`/${segment}/${entry.slug}`),
    inLanguage: 'zh-CN',
    ...(entry.url ? { sameAs: entry.url } : {}),
    ...(entry.createdAt ? { datePublished: new Date(entry.createdAt).toISOString().slice(0, 10) } : {}),
  };
}

export function jsonLdCollectionPage({
  dim,
  tag,
  entries,
}: {
  dim: string;
  tag: { slug: string; name: string; desc: string | null };
  entries: Array<{ type: string; slug: string; name: string }>;
}): JsonLdValue {
  const url = absoluteUrl(`/tags/${dim}/${tag.slug}`);

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: tag.name,
    description: tag.desc ?? `${tag.name}相关的收录`,
    url,
    inLanguage: 'zh-CN',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.name,
        url: absoluteUrl(`/${listSegment(entry.type)}/${entry.slug}`),
      })),
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: '标签总览', item: absoluteUrl('/tags') },
        { '@type': 'ListItem', position: 3, name: tag.name, item: url },
      ],
    },
  };
}

/** 把 JSON-LD 注入页面；转义 < 防止提前闭合 script 标签。
 *  组件本体见 src/components/layout/JsonLd.tsx（这里保持纯函数，方便单测）。 */
