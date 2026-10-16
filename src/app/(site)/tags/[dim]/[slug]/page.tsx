import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import EntryGrid from '@/components/card/EntryGrid';
import JsonLd from '@/components/layout/JsonLd';
import { getPublicEntries, getPublicPrimaryCityMap, getPublicTagTree } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { toCardData } from '@/lib/list-page';
import { jsonLdCollectionPage } from '@/lib/seo';
import { TAG_DIMS, TAG_DIM_LABELS } from '@/lib/tags';
import type { TagDim } from '@/types';

type PageProps = {
  params: Promise<{ dim: string; slug: string }>;
};

function isTagDim(value: string): value is TagDim {
  return (TAG_DIMS as string[]).includes(value);
}

async function findTag(dim: string, slug: string) {
  if (!isTagDim(dim)) return null;
  const tagTree = await getPublicTagTree();
  return tagTree.find((tag) => tag.dim === dim && tag.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { dim, slug } = await params;
  const tag = await findTag(dim, slug);

  if (!tag) return { title: '找不到这个标签' };

  const description = tag.desc ?? `${tag.name}标签下的收录：${TAG_DIM_LABELS[tag.dim] ?? tag.dim}维度的聚合页。`;

  return {
    title: `${tag.name} · ${TAG_DIM_LABELS[tag.dim] ?? tag.dim}`,
    description,
    alternates: { canonical: `/tags/${tag.dim}/${tag.slug}` },
    openGraph: { title: tag.name, description, url: `/tags/${tag.dim}/${tag.slug}`, type: 'article' },
  };
}

/** 标签聚合页（SEO 主力）：正文 + 混排三类条目 + 相关标签 */
export default async function TagDetailPage({ params }: PageProps) {
  const { dim, slug } = await params;
  const tag = await findTag(dim, slug);

  if (!tag) notFound();

  await trackPageView({ path: `/tags/${tag.dim}/${tag.slug}`, kind: 'tag' });

  const [paged, tagTree] = await Promise.all([
    getPublicEntries({ tagKeys: [`${tag.dim}/${tag.slug}`], sort: 'featured', pageSize: 60 }),
    getPublicTagTree(),
  ]);

  const cards = toCardData(paged.items);
  const cityOf = await getPublicPrimaryCityMap(cards.map((card) => card.id));
  const related = tagTree
    .filter((item) => item.dim === tag.dim && item.slug !== tag.slug && item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="shell py-10 sm:py-12">
      <JsonLd
        data={jsonLdCollectionPage({
          dim: tag.dim,
          tag: { slug: tag.slug, name: tag.name, desc: tag.desc },
          entries: paged.items.map((entry) => ({ type: entry.type, slug: entry.slug, name: entry.name })),
        })}
      />

      <nav aria-label="面包屑" className="text-xs text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="transition-colors duration-150 hover:text-foreground">
              首页
            </Link>
          </li>
          <li aria-hidden className="text-border">
            /
          </li>
          <li>
            <Link href="/tags" className="transition-colors duration-150 hover:text-foreground">
              标签总览
            </Link>
          </li>
          <li aria-hidden className="text-border">
            /
          </li>
          <li className="text-foreground">{tag.name}</li>
        </ol>
      </nav>

      <header className="mt-8">
        <p className="eyebrow">{TAG_DIM_LABELS[tag.dim] ?? tag.dim}</p>
        <h1 className="mt-5 flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          <span aria-hidden className="tag-dot size-3 rounded-full" style={{ '--tint': tag.color } as CSSProperties} />
          {tag.name}
          <span className="num text-sm font-normal text-muted-foreground">{tag.count} 条</span>
        </h1>
        {tag.desc ? <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">{tag.desc}</p> : null}
      </header>

      <div className="hairline mt-8" />

      <section className="mt-8" aria-label="收录列表">
        {cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-20 text-center">
            <p className="text-sm text-muted-foreground">该标签下暂无收录</p>
            <Link href="/submit" className="mt-4 inline-block text-sm text-brand hover:underline">
              推荐收录
            </Link>
          </div>
        ) : (
          <EntryGrid entries={cards} showType cityOf={cityOf} />
        )}
      </section>

      {related.length > 0 ? (
        <section className="mt-16" aria-labelledby="related-tags">
          <div>
            <h2 id="related-tags" className="text-lg font-semibold">
              相关标签
            </h2>
            <div className="hairline mt-4" />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/tags/${item.dim}/${item.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs transition-colors duration-150 hover:border-foreground/20 hover:bg-accent"
              >
                <span
                  aria-hidden
                  className="tag-dot size-1.5 rounded-full"
                  style={{ '--tint': item.color } as CSSProperties}
                />
                {item.name}
                <span className="num text-muted-foreground">{item.count}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
