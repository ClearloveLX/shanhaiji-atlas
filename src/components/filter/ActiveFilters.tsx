'use client';

import { X } from 'lucide-react';
import { useTagFilter } from '@/hooks/use-tag-filter';
import type { TagDim } from '@/types';

/** 标题下方显示已选条件，每个都能单独删掉 */
export default function ActiveFilters({ labels }: { labels: Record<string, string> }) {
  const { selected, remove, clearAll, activeCount } = useTagFilter();

  if (activeCount === 0) return null;

  const chips: Array<{ dim: TagDim; slug: string; label: string }> = [];
  for (const dim of ['topic', 'scene', 'attr', 'platform', 'price', 'quality'] as TagDim[]) {
    for (const slug of selected[dim]) {
      chips.push({ dim, slug, label: labels[`${dim}/${slug}`] ?? slug });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="eyebrow">已选</span>

      {chips.map((chip) => (
        <button
          key={`${chip.dim}/${chip.slug}`}
          type="button"
          onClick={() => remove(chip.dim, chip.slug)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-opacity duration-150 hover:opacity-85"
          aria-label={`移除筛选 ${chip.label}`}
        >
          {chip.label}
          <X className="size-3" aria-hidden />
        </button>
      ))}

      <button
        type="button"
        onClick={clearAll}
        className="ml-1 text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
      >
        清空全部
      </button>
    </div>
  );
}
