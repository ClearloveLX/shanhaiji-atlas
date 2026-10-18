import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { MapPin, Sparkles } from 'lucide-react';
import type { Tag } from '@/db/schema';
import { ENTRY_TYPE_LABELS, listSegment, sortChips } from '@/lib/tags';
import { cn, colorFromName, domainOf, initialOf } from '@/lib/utils';

export type EntryCardData = {
  id: string;
  type: string;
  linkMode: string;
  slug: string;
  name: string;
  nameEn: string | null;
  summary: string;
  url: string | null;
  icon: string | null;
  featured: boolean;
  status: string;
  tags: Tag[];
  /** place 类型才有：主门店城市 */
  city?: string | null;
};

/**
 * 条目卡片（Server Component）。
 *
 * **卡片一律在新标签页打开详情**：列表留在原标签不动，看完一个详情再决定要不要继续逛。
 * 详情页的主按钮则是「覆盖当前标签」（见 EntryDetail）—— 于是一个东西占一个标签，
 * 不会出现「列表没了、详情页还杵在那儿、真站点又在第三个标签」这种局面。
 *
 * 整张卡是站内链接 —— 不是外链，外链只在详情页的主按钮上走 /go/{slug}。
 *
 * variant='feature' 给首页编辑精选用：更大、简介多一行。
 */
export default function EntryCard({
  entry,
  showType = false,
  variant = 'default',
  className,
}: {
  entry: EntryCardData;
  showType?: boolean;
  variant?: 'default' | 'feature';
  className?: string;
}) {
  const chips = sortChips(entry.tags).filter((tag) => tag.dim !== 'quality');
  const visibleChips = chips.slice(0, variant === 'feature' ? 3 : 4);
  const restCount = chips.length - visibleChips.length;
  const domain = domainOf(entry.url);
  const dimmed = entry.status === 'stale' || entry.status === 'dead';
  const feature = variant === 'feature';
  const fallbackColor = colorFromName(entry.name);

  return (
    <Link
      href={`/${listSegment(entry.type)}/${entry.slug}`}
      target="_blank"
      rel="noopener"
      className={cn('surface surface-hover flex flex-col gap-3', feature ? 'p-5' : 'p-4', dimmed && 'opacity-60', className)}
    >
      <div className="flex items-start gap-3">
        {entry.icon ? (
          <Image
            src={entry.icon}
            alt=""
            width={44}
            height={44}
            className={cn(
              'shrink-0 rounded-xl border border-border bg-background object-cover',
              feature ? 'size-11' : 'size-10',
            )}
            unoptimized
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              'tile-tint flex shrink-0 items-center justify-center rounded-xl text-sm font-semibold',
              feature ? 'size-11' : 'size-10',
            )}
            style={{ '--tint': fallbackColor } as CSSProperties}
          >
            {initialOf(entry.name)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('truncate', feature ? 'text-[15px] font-semibold' : 'font-medium')}>{entry.name}</span>
            <span className="sr-only">（在新标签页打开）</span>
            {entry.nameEn ? <span className="truncate text-xs text-muted-foreground">{entry.nameEn}</span> : null}

            {entry.linkMode === 'internal' ? (
              <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">基本自研</span>
            ) : null}

            {entry.linkMode === 'place' && entry.city ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <MapPin className="size-3" aria-hidden />
                {entry.city}
              </span>
            ) : null}

            {entry.featured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-medium text-brand-foreground">
                <Sparkles className="size-3" aria-hidden />
                精选
              </span>
            ) : null}
          </div>

          <p
            className={cn(
              'mt-2 text-sm leading-relaxed text-muted-foreground',
              feature ? 'line-clamp-3' : 'line-clamp-2',
            )}
          >
            {entry.summary}
          </p>
        </div>
      </div>

      <div className="relative mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {showType ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              {ENTRY_TYPE_LABELS[entry.type] ?? entry.type}
            </span>
          ) : null}

          {visibleChips.map((tag) => (
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

          {restCount > 0 ? (
            /* 悬停展开剩下的标签。纯 CSS（没有 tooltip 库）：
               · 用 opacity 而不是 display:none —— 屏幕阅读器照样能读到完整标签列表
               · 面板按「底栏」定位（inset-x-0，见上面那个 relative），不是按这颗胶囊：
                 胶囊可能靠卡片左边，按它定位会往左顶出卡片
               · 往上弹（bottom-full）而不是往下：卡片常在网格最后一行，往下会被视口裁掉 */
            <span className="group/more inline-flex">
              <span className="num cursor-help rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground transition-colors duration-150 group-hover/more:bg-primary group-hover/more:text-primary-foreground">
                +{restCount}
              </span>

              <span className="pointer-events-none absolute inset-x-0 bottom-full z-20 mb-2 rounded-xl border border-border bg-popover p-2.5 opacity-0 shadow-lg transition-opacity duration-150 group-hover/more:pointer-events-auto group-hover/more:opacity-100">
                <span className="mb-2 block text-[10px] tracking-[0.14em] text-muted-foreground">
                  其余 {restCount} 个标签
                </span>
                <span className="flex flex-wrap gap-1">
                  {chips.slice(visibleChips.length).map((tag) => (
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
                </span>
              </span>
            </span>
          ) : null}

          {entry.status === 'stale' ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">疑似失效</span>
          ) : null}
          {entry.status === 'dead' ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">已失效</span>
          ) : null}
        </div>

        {domain ? <span className="num shrink-0 text-[11px] text-muted-foreground">{domain}</span> : null}
      </div>
    </Link>
  );
}
