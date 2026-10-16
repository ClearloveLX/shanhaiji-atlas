'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { setStatus, toggleFeatured } from '@/actions/entries';
import { ENTRY_STATUS_LABELS } from '@/lib/tags';
import { cn } from '@/lib/utils';
import type { EntryStatus } from '@/types';

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stale: 'border-amber-200 bg-amber-50 text-amber-700',
  dead: 'border-rose-200 bg-rose-50 text-rose-700',
};

/** 列表里直接切状态，不用进编辑页 */
export function StatusToggle({ id, status }: { id: string; status: string }) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    const previous = current;
    setCurrent(next);

    startTransition(async () => {
      const result = await setStatus(id, next as EntryStatus);
      if (!result.ok) {
        setCurrent(previous);
        toast.error(result.error);
        return;
      }
      toast.success(`已标记为「${ENTRY_STATUS_LABELS[next] ?? next}」`);
    });
  }

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(event) => handleChange(event.target.value)}
      aria-label="切换状态"
      className={cn(
        'h-7 rounded-md border px-1.5 text-xs outline-none transition-opacity disabled:opacity-60',
        STATUS_CLASSES[current] ?? 'border-neutral-200 bg-white text-neutral-600',
      )}
    >
      <option value="active">正常</option>
      <option value="stale">疑似失效</option>
      <option value="dead">已失效</option>
    </select>
  );
}

/** 列表里直接切精选 */
export function FeaturedToggle({ id, featured, name }: { id: string; featured: boolean; name: string }) {
  const [current, setCurrent] = useState(featured);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const previous = current;
    setCurrent(!previous);

    startTransition(async () => {
      const result = await toggleFeatured(id);
      if (!result.ok) {
        setCurrent(previous);
        toast.error(result.error);
        return;
      }
      setCurrent(result.data.featured);
      toast.success(result.data.featured ? `「${name}」已设为精选` : `「${name}」已取消精选`);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={current}
      aria-label={current ? `取消「${name}」的精选` : `把「${name}」设为精选`}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md border transition-colors disabled:opacity-60',
        current ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-neutral-200 text-neutral-300 hover:text-neutral-500',
      )}
    >
      <Star className={cn('size-4', current && 'fill-current')} aria-hidden />
    </button>
  );
}
