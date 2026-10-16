'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import TagMatchToggle from '@/components/filter/TagMatchToggle';
import { useTagFilter } from '@/hooks/use-tag-filter';
import type { TagDim } from '@/types';

export type FilterGroup = {
  dim: TagDim;
  label: string;
  tags: Array<{ slug: string; name: string; color: string; count: number }>;
};

/**
 * 左侧筛选栏（220px，lg 以下折进抽屉）。
 * 组内显示「名称 (N)」，顺序按 tags 表的 sort，由服务端排好再传进来。
 *
 * 选中态用墨黑实心，不铺标签原色：一屏里十几个彩色实心块会糊成一片，
 * 标签颜色只作为未选中时的一个小圆点保留。
 */
export default function FilterPanel({ groups }: { groups: FilterGroup[] }) {
  const { isSelected, toggle } = useTagFilter();

  return (
    <div className="flex flex-col gap-7">
      <TagMatchToggle />

      {groups.map((group) => (
        <section key={group.dim} aria-labelledby={`filter-${group.dim}`}>
          <h3 id={`filter-${group.dim}`} className="eyebrow">
            {group.label}
          </h3>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {group.tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">暂无</span>
            ) : (
              group.tags.map((tag) => {
                const active = isSelected(group.dim, tag.slug);
                const disabled = tag.count === 0 && !active;

                return (
                  <button
                    key={tag.slug}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => toggle(group.dim, tag.slug)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150',
                      active
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-foreground/20 hover:bg-accent',
                      disabled && 'cursor-not-allowed opacity-40 hover:border-border hover:bg-background',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn('size-1.5 shrink-0 rounded-full', !active && 'tag-dot')}
                      style={active ? undefined : ({ '--tint': tag.color } as CSSProperties)}
                    />
                    {tag.name}
                    <span className={cn('num', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      {tag.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
