'use client';

import { cn } from '@/lib/utils';
import { useTagFilter } from '@/hooks/use-tag-filter';
import type { TagMatchMode } from '@/db/queries';

const OPTIONS: Array<{ value: TagMatchMode; label: string; hint: string }> = [
  { value: 'all', label: '全部满足', hint: '同时满足所有选中的标签，选得越多范围越小。' },
  { value: 'any', label: '任一满足', hint: '满足任意一个选中的标签就会出现，适合先铺开看看。' },
];

/**
 * 多标签的匹配方式（强关联 / 弱关联）。
 * 选中 2 个以上标签才有意义 —— 只有 1 个时两种模式结果完全相同，所以那时不渲染。
 */
export default function TagMatchToggle() {
  const { tagMatch, setTagMatch, activeCount } = useTagFilter();

  if (activeCount < 2) return null;

  const active = OPTIONS.find((option) => option.value === tagMatch) ?? OPTIONS[0];

  return (
    <section aria-labelledby="filter-match">
      <h3 id="filter-match" className="eyebrow">
        标签匹配
      </h3>

      <div
        role="group"
        aria-label="多个标签之间的匹配方式"
        className="mt-3 inline-flex rounded-full border border-border bg-background p-0.5"
      >
        {OPTIONS.map((option) => {
          const current = option.value === tagMatch;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={current}
              onClick={() => setTagMatch(option.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs transition-colors duration-150',
                current
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{active.hint}</p>
    </section>
  );
}

/**
 * 空结果时的一键改档：强关联下标签一多很容易筛空，
 * 与其让人自己回筛选栏找开关，不如在这儿直接给出口。
 */
export function TagMatchFallback() {
  const { tagMatch, setTagMatch, activeCount } = useTagFilter();

  if (tagMatch !== 'all' || activeCount < 2) return null;

  return (
    <p className="mt-2">
      <button
        type="button"
        onClick={() => setTagMatch('any')}
        className="text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
      >
        改用「任一满足」再试一次
      </button>
    </p>
  );
}
