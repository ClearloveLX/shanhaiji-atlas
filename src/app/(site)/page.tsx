import Link from 'next/link';
import { ArrowRight, Database, Store, Tags as TagsIcon } from 'lucide-react';
import EntryCard from '@/components/card/EntryCard';
import EntryGrid from '@/components/card/EntryGrid';
import JsonLd from '@/components/layout/JsonLd';
import SearchBox from '@/components/search/SearchBox';
import {
  getPublicFeatured,
  getPublicLatest,
  getPublicPrimaryCityMap,
  getPublicTagCountsByType,
  getPublicTypeCounts,
} from '@/db/queries';
import { toCardData, toCardItem } from '@/lib/list-page';
import { trackPageView } from '@/lib/analytics';
import { jsonLdWebSite } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';
import { listSegment, listTitle } from '@/lib/tags';

/** 栏目标题：序号 + 标题 + 一句话说明，下面压一条发丝线，撑出版面的秩序感 */
function SectionHead({
  id,
  index,
  title,
  hint,
  action,
}: {
  id: string;
  index: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="index-num">{index}</span>
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
        </div>
        {action}
      </div>
      <div className="hairline mt-4" />
    </div>
  );
}

export default async function HomePage() {
  await trackPageView({ path: '/', kind: 'home' });

  const [featured, latest, typeCounts, tagCounts] = await Promise.all([
    getPublicFeatured(6),
    getPublicLatest(12),
    getPublicTypeCounts(),
    getPublicTagCountsByType(null),
  ]);

  const cityMap = await getPublicPrimaryCityMap([...featured, ...latest].map((entry) => entry.id));

  const countOf = (type: string) => typeCounts.find((item) => item.type === type)?.count ?? 0;
  const sceneTags = tagCounts
    .filter((tag) => tag.dim === 'scene' && tag.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalEntries = typeCounts.reduce((sum, item) => sum + item.count, 0);
  const tagTotal = tagCounts.filter((tag) => tag.count > 0).length;

  const entrances = [
    { type: 'tool', icon: Database, description: '能直接解决问题的在线工具' },
    { type: 'site', icon: TagsIcon, description: '常去的站点，省得每次重新找' },
    { type: 'shop', icon: Store, description: '线上店与线下实体店' },
  ];

  const stats = [
    { label: '在线工具', value: countOf('tool'), href: '/tools' },
    { label: '常用站点', value: countOf('site'), href: '/sites' },
    { label: '推荐店铺', value: countOf('shop'), href: '/shops' },
    { label: '在用标签', value: tagTotal, href: '/tags' },
  ];

  return (
    <div>
      <JsonLd data={jsonLdWebSite()} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="halo" />
        <div aria-hidden className="topo topo-fade absolute inset-0" />

        <div className="shell relative pb-16 pt-20 sm:pb-20 sm:pt-28">
          <p className="eyebrow">收录索引 · 人工筛选</p>

          <h1 className="mt-7 text-5xl font-semibold leading-[1.06] sm:text-7xl">
            {siteConfig.name}
            <span className="ml-3 font-normal text-muted-foreground/60 sm:ml-5">{siteConfig.nameEn}</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{siteConfig.slogan}</p>

          <div className="mt-10 max-w-2xl">
            <SearchBox className="w-full" size="lg" placeholder="搜索工具、站点、店铺" />
          </div>

          <div className="mt-12 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="group flex flex-col gap-1 bg-background px-4 py-4 transition-colors duration-150 hover:bg-accent"
              >
                <span className="num text-2xl font-medium">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </Link>
            ))}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            已收录 <span className="num text-foreground">{totalEntries}</span> 条，按场景与属性标注标签，便于逐层缩小范围。
          </p>
        </div>
      </section>

      <div className="shell py-16 sm:py-20">
        {/* 编辑精选 */}
        {featured.length > 0 ? (
          <section aria-labelledby="featured-heading">
            <SectionHead
              id="featured-heading"
              index="01"
              title="编辑精选"
              hint="人工挑选"
              action={
                <Link href="/tools" className="hidden items-center gap-1 text-[13px] text-brand hover:underline sm:flex">
                  全部收录
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />

            {/* 往下铺成网格，不做横滑：横滑会露出一条系统滚动条，
                而且 overflow 会把卡片里「+N」那个向上弹的标签浮层裁掉 */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((entry) => (
                <EntryCard
                  key={entry.id}
                  variant="feature"
                  entry={{ ...toCardItem(entry), city: cityMap[entry.id] ?? null }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* 三个入口大卡 */}
        <section className="mt-16" aria-label="分类入口">
          <div className="grid gap-4 sm:grid-cols-3">
            {entrances.map((entrance) => {
              const Icon = entrance.icon;
              return (
                <Link key={entrance.type} href={`/${listSegment(entrance.type)}`} className="surface surface-hover flex flex-col gap-6 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-foreground">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="num text-3xl font-medium">{countOf(entrance.type)}</span>
                  </div>

                  <div>
                    <p className="text-base font-medium">{listTitle(entrance.type)}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{entrance.description}</p>
                  </div>

                  <span className="mt-auto flex items-center gap-1.5 text-[13px] font-medium text-brand">
                    查看收录
                    <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 按场景逛：做成书末索引的样子 */}
        {sceneTags.length > 0 ? (
          <section className="mt-16" aria-labelledby="scenes-heading">
            <SectionHead id="scenes-heading" index="02" title="按场景逛" hint="从用途出发" />

            <div className="mt-2 grid gap-x-14 sm:grid-cols-2 lg:grid-cols-3">
              {sceneTags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/tags/scene/${tag.slug}`}
                  className="group flex items-baseline gap-3 border-b border-border py-3.5 transition-colors duration-150"
                >
                  <span className="text-sm transition-colors duration-150 group-hover:text-brand">{tag.name}</span>
                  <span aria-hidden className="h-px flex-1 translate-y-[-3px] border-b border-dashed border-border" />
                  <span className="num min-w-6 text-right text-xs text-muted-foreground">{tag.count}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* 最新收录 */}
        <section className="mt-16" aria-labelledby="latest-heading">
          <SectionHead
            id="latest-heading"
            index="03"
            title="最新收录"
            hint="近期整理"
            action={
              <Link href="/tags" className="hidden items-center gap-1 text-[13px] text-brand hover:underline sm:flex">
                标签总览
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />

          <div className="mt-6">
            <EntryGrid entries={toCardData(latest)} showType cityOf={cityMap} />
          </div>
        </section>
      </div>
    </div>
  );
}
