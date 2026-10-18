import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, CodeXml, Database, Store, Tags as TagsIcon } from 'lucide-react';
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
    { type: 'tool', icon: Database, description: '在线能用的工具，与软件官网' },
    { type: 'site', icon: TagsIcon, description: '常去的站点，省得每次重新找' },
    { type: 'code', icon: CodeXml, description: '开源项目与能直接抄的源码' },
    { type: 'shop', icon: Store, description: '线上店与线下实体店' },
  ];

  const stats = [
    { label: '工具分享', value: countOf('tool'), href: '/tools' },
    { label: '站点分享', value: countOf('site'), href: '/sites' },
    { label: '源码分享', value: countOf('code'), href: '/codes' },
    { label: '好店分享', value: countOf('shop'), href: '/shops' },
    { label: '在用标签', value: tagTotal, href: '/tags' },
  ];

  return (
    <div>
      <JsonLd data={jsonLdWebSite()} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="halo" />
        <div aria-hidden className="topo topo-fade absolute inset-0" />

        {/* 宽屏时左右分栏：左边站名 + 搜索，右边四个数字。
            单栏排的话右半边整块空着，hero 又高到把「编辑精选」顶出首屏 */}
        <div className="shell relative grid gap-8 pb-10 pt-12 sm:pb-12 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_32rem] lg:items-center lg:gap-12">
          <div className="min-w-0">
            <p className="eyebrow">收录索引 · 人工筛选</p>

            <h1 className="mt-4 text-4xl font-semibold leading-[1.06] sm:text-6xl">
              {siteConfig.name}
              <span className="ml-3 font-normal text-muted-foreground/60 sm:ml-4">{siteConfig.nameEn}</span>
            </h1>

            <p className="mt-3.5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {siteConfig.slogan}
            </p>

            <div className="mt-6 max-w-xl">
              <SearchBox className="w-full" size="lg" placeholder="搜索工具、站点、源码、好店" />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* 五个数字一行铺满：手机两列时最后一项跨两列，不留灰格 */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
              {stats.map((stat) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="group flex flex-col gap-0.5 bg-background px-4 py-3 transition-colors duration-150 last:col-span-2 hover:bg-accent sm:last:col-span-1"
                >
                  <span className="num text-2xl font-medium">{stat.value}</span>
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </Link>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              已收录 <span className="num text-foreground">{totalEntries}</span> 条，按场景与属性标注标签，便于逐层缩小范围。
            </p>
          </div>
        </div>
      </section>

      <div className="shell py-10 sm:py-14">
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

        {/* 四个入口大卡 */}
        <section className="mt-16" aria-label="分类入口">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* 按场景逛：一排胶囊。
            原来铺三列「书名索引」（名字—虚线—计数），7 个标签填不满三列，
            最后一格豁一块，虚线又长得把名字和数字拉散了 */}
        {sceneTags.length > 0 ? (
          <section className="mt-16" aria-labelledby="scenes-heading">
            <SectionHead id="scenes-heading" index="02" title="按场景逛" hint="从用途出发" />

            <ul className="mt-5 flex flex-wrap gap-2">
              {sceneTags.map((tag) => (
                <li key={tag.id}>
                  <Link
                    href={`/tags/scene/${tag.slug}`}
                    className="group inline-flex items-center gap-2 rounded-full border border-border bg-background py-2 pl-3.5 pr-2.5 text-sm transition-colors duration-150 hover:border-brand/40 hover:bg-brand-soft"
                  >
                    <span
                      aria-hidden
                      className="tag-dot size-2 rounded-full"
                      style={{ '--tint': tag.color } as CSSProperties}
                    />
                    {tag.name}
                    <span className="num rounded-full bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors duration-150 group-hover:bg-background group-hover:text-brand">
                      {tag.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
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
