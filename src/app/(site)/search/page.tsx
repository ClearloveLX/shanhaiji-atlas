import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import Highlight from '@/components/search/Highlight';
import SearchBox from '@/components/search/SearchBox';
import { Button } from '@/components/ui/button';
import { getPublicTagCountsByType, searchPublicEntries, type SearchHit } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { listSegment, listTitle } from '@/lib/tags';

export const metadata: Metadata = {
  title: '搜索',
  description: '在全部收录里搜工具、站点和店铺。',
  alternates: { canonical: '/search' },
  robots: { index: false, follow: true },
};

const TYPE_ORDER = ['tool', 'site', 'shop'];

function ResultRow({ hit, keyword }: { hit: SearchHit; keyword: string }) {
  const chips = hit.tags.filter((tag) => tag.dim !== 'quality').slice(0, 3);

  return (
    <li>
      {/* 和列表页的卡片一致：新开标签进详情，搜索结果留在原标签 */}
      <Link
        href={`/${listSegment(hit.type)}/${hit.slug}`}
        target="_blank"
        rel="noopener"
        className="surface surface-hover flex flex-col gap-2 p-4"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            <Highlight text={hit.name} keyword={keyword} />
          </span>
          <span className="sr-only">（在新标签页打开）</span>
          {hit.nameEn ? (
            <span className="text-xs text-muted-foreground">
              <Highlight text={hit.nameEn} keyword={keyword} />
            </span>
          ) : null}
          {hit.featured ? (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-medium text-brand-foreground">精选</span>
          ) : null}
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            {listTitle(hit.type)}
          </span>
        </span>

        <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          <Highlight text={hit.summary} keyword={keyword} />
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          {chips.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <span
                aria-hidden
                className="tag-dot size-1.5 rounded-full"
                style={{ '--tint': tag.color } as CSSProperties}
              />
              {tag.name}
            </span>
          ))}
          {hit.url ? (
            <span className="num ml-auto text-[11px] text-muted-foreground">
              {hit.url.replace(/^https?:\/\//, '').slice(0, 40)}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const keyword = (raw ?? '').trim();

  // 搜索词不进统计：只记「搜索页被人用过」，不记搜了什么
  await trackPageView({ path: '/search', kind: 'search' });

  const started = Date.now();
  const hits = keyword ? await searchPublicEntries(keyword, 60) : [];
  const elapsed = Date.now() - started;

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: hits.filter((hit) => hit.type === type),
  })).filter((group) => group.items.length > 0);

  const hotTags = keyword
    ? []
    : (await getPublicTagCountsByType(null))
        .filter((tag) => tag.dim === 'scene')
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

  return (
    <div className="shell max-w-[900px] py-12 sm:py-14">
      <header>
        <p className="eyebrow">检索</p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">搜索</h1>
      </header>

      <div className="mt-8">
        <SearchBox className="w-full" size="lg" placeholder="搜工具、站点、店铺、标签" />
      </div>

      {keyword ? (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {hits.length > 0 ? (
            <>
              找到 <span className="num font-medium text-foreground">{hits.length}</span> 条，耗时{' '}
              <span className="num">{elapsed}ms</span>
            </>
          ) : (
            <>
              「{keyword}」没有匹配的结果，耗时 <span className="num">{elapsed}ms</span>
            </>
          )}
        </p>
      ) : null}

      {keyword && hits.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <SearchX className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">没有匹配结果。若尚未收录，欢迎推荐。</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link href={`/submit`}>提交收录</Link>
            </Button>
            {hotTags.map((tag) => (
              <Button key={tag.id} asChild variant="outline">
                <Link href={`/tags/scene/${tag.slug}`}>{tag.name}</Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {grouped.map((group) => (
        <section key={group.type} className="mt-12" aria-labelledby={`search-${group.type}`}>
          <div className="flex items-baseline gap-3">
            <h2 id={`search-${group.type}`} className="text-sm font-medium">
              {listTitle(group.type)}
            </h2>
            <span className="num text-xs text-muted-foreground">{group.items.length}</span>
          </div>
          <div className="hairline mt-3" />

          <ul className="mt-4 flex flex-col gap-3">
            {group.items.map((hit) => (
              <ResultRow key={hit.id} hit={hit} keyword={keyword} />
            ))}
          </ul>
        </section>
      ))}

      {!keyword ? (
        <div className="surface mt-10 p-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            输入关键词开始搜索：名称命中优先，简介与标签命中随后。按{' '}
            <kbd className="num rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs">/</kbd> 可聚焦顶栏搜索框。
          </p>
        </div>
      ) : null}
    </div>
  );
}
