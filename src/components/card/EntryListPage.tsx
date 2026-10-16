import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import EntryGrid from '@/components/card/EntryGrid';
import type { EntryCardData } from '@/components/card/EntryCard';
import ActiveFilters from '@/components/filter/ActiveFilters';
import FilterPanel, { type FilterGroup } from '@/components/filter/FilterPanel';
import { TagMatchFallback } from '@/components/filter/TagMatchToggle';
import SortSelect from '@/components/search/SortSelect';

/**
 * 三个列表页（/tools /sites /shops）共用的模板。
 * 页面本身是 Server Component：从 searchParams 读筛选条件、去数据库查，客户端组件只负责改 URL。
 */
export default function EntryListPage({
  title,
  total,
  entries,
  groups,
  labels,
  cities,
  sort,
  showType = false,
  emptyHint,
}: {
  title: string;
  total: number;
  entries: EntryCardData[];
  groups: FilterGroup[];
  labels: Record<string, string>;
  cities?: Record<string, string | null>;
  sort: string;
  showType?: boolean;
  emptyHint?: string;
}) {
  return (
    <div className="shell py-14 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <span className="num text-sm text-muted-foreground">共 {total} 条</span>
        </div>
        <SortSelect value={sort} />
      </header>

      <div className="hairline mt-6" />

      {labels && Object.keys(labels).length > 0 ? (
        <div className="mt-5">
          <ActiveFilters labels={labels} />
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-12">
        <div className="lg:w-[220px] lg:shrink-0">
          {/* 纯 CSS 的折叠：checkbox 控制显隐，不用 JS，也不会和 hydration 打架 */}
          <input type="checkbox" id="filter-toggle" className="peer sr-only" />
          <label
            htmlFor="filter-toggle"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm transition-colors duration-150 hover:border-foreground/20 hover:bg-accent lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            筛选
          </label>

          <div className="mt-3 hidden peer-checked:block lg:sticky lg:top-24 lg:mt-0 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
            <FilterPanel groups={groups} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-20 text-center">
              <p className="text-sm text-muted-foreground">没有符合筛选条件的收录</p>
              {emptyHint ? <p className="mt-2 text-xs text-muted-foreground">{emptyHint}</p> : null}
              <TagMatchFallback />
              <Link href="." className="mt-5 inline-block text-sm text-brand hover:underline">
                清空筛选
              </Link>
            </div>
          ) : (
            <EntryGrid entries={entries} showType={showType} cityOf={cities} />
          )}
        </div>
      </div>
    </div>
  );
}
