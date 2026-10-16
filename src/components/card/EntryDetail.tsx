import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, ExternalLink, Wrench } from 'lucide-react';
import EntryGrid from '@/components/card/EntryGrid';
import type { EntryCardData } from '@/components/card/EntryCard';
import TagChip from '@/components/filter/TagChip';
import JsonLd from '@/components/layout/JsonLd';
import { Button } from '@/components/ui/button';
import type { EntryDetail as EntryDetailData } from '@/db/queries';
import { jsonLdEntry } from '@/lib/seo';
import { sortChips } from '@/lib/tags';
import { colorFromName, domainOf, formatDate, initialOf } from '@/lib/utils';

/**
 * 详情页主体（三个类型共用）。
 *
 * 标签页策略：列表里的卡片新开标签进详情（见 EntryCard），详情页的主按钮**覆盖当前标签** ——
 * 列表留在原标签，一个东西一个标签，不会越点越多。
 *
 * 主按钮按 link_mode 分叉：
 *   external → 访问官网，走 /go/{slug}（统计 + nofollow），当前标签直接跳过去
 *   internal → 打开工具，站内跳 /tools/{slug}/app
 *   place    → 由线下店页面在 sidebar 里给导航按钮组
 */
export default function EntryDetail({
  detail,
  recommendations,
  cityOf,
  sidebar,
  headerExtra,
}: {
  detail: EntryDetailData;
  recommendations: EntryCardData[];
  cityOf?: Record<string, string | null>;
  sidebar?: ReactNode;
  headerExtra?: ReactNode;
}) {
  const segment = detail.type === 'site' ? 'sites' : detail.type === 'shop' ? 'shops' : 'tools';
  const chips = sortChips(detail.tags);
  const platformTags = chips.filter((tag) => tag.dim === 'platform');
  const priceTags = chips.filter((tag) => tag.dim === 'price');
  const domain = domainOf(detail.url);
  const isInternal = detail.linkMode === 'internal';
  const fallbackColor = colorFromName(detail.name);

  const primaryAction =
    detail.linkMode === 'external' && detail.url ? (
      <Button asChild size="lg">
        <a href={`/go/${detail.slug}`} rel="nofollow noreferrer">
          访问官网
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </Button>
    ) : isInternal ? (
      <Button asChild size="lg">
        <Link href={`/tools/${detail.slug}/app`}>
          打开工具
          <Wrench className="size-4" aria-hidden />
        </Link>
      </Button>
    ) : null;

  return (
    <div className="shell py-10 sm:py-12">
      <JsonLd data={jsonLdEntry(detail)} />

      {/* 面包屑 */}
      <nav aria-label="面包屑" className="text-xs text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors duration-150 hover:text-foreground">
              首页
            </Link>
          </li>
          <li aria-hidden className="text-border">
            <ChevronRight className="size-3" />
          </li>
          <li>
            <Link href={`/${segment}`} className="transition-colors duration-150 hover:text-foreground">
              {detail.type === 'site' ? '常用站点' : detail.type === 'shop' ? '推荐店铺' : '在线工具'}
            </Link>
          </li>
          <li aria-hidden className="text-border">
            <ChevronRight className="size-3" />
          </li>
          <li className="text-foreground">{detail.name}</li>
        </ol>
      </nav>

      <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:gap-14">
        <article className="min-w-0 flex-1">
          <header className="flex items-start gap-5">
            {detail.icon ? (
              <Image
                src={detail.icon}
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-2xl border border-border bg-background object-cover"
                unoptimized
              />
            ) : (
              <span
                aria-hidden
                className="tile-tint flex size-16 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold"
                style={{ '--tint': fallbackColor } as CSSProperties}
              >
                {initialOf(detail.name)}
              </span>
            )}

            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {detail.name}
                {detail.nameEn ? (
                  <span className="ml-3 text-base font-normal text-muted-foreground">{detail.nameEn}</span>
                ) : null}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{detail.summary}</p>
              {detail.status !== 'active' ? (
                <p className="mt-3 inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                  {detail.status === 'dead' ? '这个条目已被标记为失效' : '这个条目可能已经失效'}
                </p>
              ) : null}
            </div>
          </header>

          {chips.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {chips.map((tag) => (
                <TagChip key={tag.id} name={tag.name} color={tag.color} href={`/tags/${tag.dim}/${tag.slug}`} />
              ))}
            </div>
          ) : null}

          {primaryAction || headerExtra ? (
            <div className="mt-7 flex flex-wrap items-center gap-4">
              {primaryAction}
              {headerExtra}
              {domain ? <span className="num text-[13px] text-muted-foreground">{domain}</span> : null}
            </div>
          ) : null}

          {detail.note ? (
            <section className="mt-10" aria-labelledby="note-heading">
              <h2 id="note-heading" className="eyebrow">
                编辑手记
              </h2>
              <div className="mt-4 rounded-xl border border-border bg-background p-5 text-sm leading-relaxed whitespace-pre-line">
                {detail.note}
              </div>
            </section>
          ) : null}

          <section className="mt-10" aria-labelledby="meta-heading">
            <h2 id="meta-heading" className="eyebrow">
              收录信息
            </h2>
            <dl className="mt-4 grid gap-x-10 gap-y-0 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-border py-2.5">
                <dt className="text-muted-foreground">收录时间</dt>
                <dd className="num">{formatDate(detail.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border py-2.5">
                <dt className="text-muted-foreground">平台</dt>
                <dd>{platformTags.map((tag) => tag.name).join('、') || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border py-2.5">
                <dt className="text-muted-foreground">价格</dt>
                <dd>{priceTags.map((tag) => tag.name).join('、') || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border py-2.5">
                <dt className="text-muted-foreground">状态</dt>
                <dd>{detail.status === 'active' ? '正常' : detail.status === 'stale' ? '疑似失效' : '已失效'}</dd>
              </div>
            </dl>
          </section>

          <p className="mt-6 text-xs text-muted-foreground">
            信息有误？{' '}
            <Link href="/submit" className="text-brand hover:underline">
              欢迎反馈
            </Link>
          </p>

          {recommendations.length > 0 ? (
            <section className="mt-14" aria-labelledby="related-heading">
              <div>
                <h2 id="related-heading" className="text-lg font-semibold">
                  同类推荐
                </h2>
                <div className="hairline mt-4" />
              </div>
              <div className="mt-6">
                <EntryGrid entries={recommendations} showType cityOf={cityOf} />
              </div>
            </section>
          ) : null}
        </article>

        {sidebar ? (
          <aside className="w-full shrink-0 lg:w-[340px]" aria-label="附加信息">
            {sidebar}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
