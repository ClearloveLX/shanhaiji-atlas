'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createTag } from '@/actions/tags';
import { Button } from '@/components/ui/button';
import { MAX_TAGS_PER_DIM, pickTagColor, TAG_DIM_LABELS, TAG_DIMS, slugifyTagName } from '@/lib/tags';
import { cn } from '@/lib/utils';

export type TagOption = {
  id: string;
  dim: string;
  slug: string;
  name: string;
  color: string;
  icon: string | null;
};

export type TagSelectionValue = {
  topic: string[];
  scene: string[];
  attr: string[];
  platform: string[];
  price: string[];
  quality: string[];
};

export const EMPTY_TAG_SELECTION: TagSelectionValue = {
  topic: [],
  scene: [],
  attr: [],
  platform: [],
  price: [],
  quality: [],
};

/**
 * 标签多选：按维度分组，每个维度显示已选数量与上限。
 * 没有想要的标签时，在对应维度的输入框里回车就能新建（即时写 tags 表并自动选中）。
 */
export default function TagPicker({
  tags,
  value,
  onChange,
  disabled = false,
}: {
  tags: TagOption[];
  value: TagSelectionValue;
  onChange: (next: TagSelectionValue) => void;
  disabled?: boolean;
}) {
  const [extraTags, setExtraTags] = useState<TagOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingDim, setPendingDim] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const allTags = useMemo(() => {
    const merged = [...tags];
    for (const extra of extraTags) {
      if (!merged.some((tag) => tag.id === extra.id)) merged.push(extra);
    }
    return merged;
  }, [tags, extraTags]);

  const grouped = useMemo(() => {
    const map = new Map<string, TagOption[]>();
    for (const dim of TAG_DIMS) map.set(dim, []);
    for (const tag of allTags) {
      const list = map.get(tag.dim);
      if (list) list.push(tag);
    }
    return map;
  }, [allTags]);

  function toggle(dim: keyof TagSelectionValue, slug: string) {
    if (disabled) return;

    const current = value[dim];
    const limit = MAX_TAGS_PER_DIM[dim];

    if (current.includes(slug)) {
      onChange({ ...value, [dim]: current.filter((item) => item !== slug) });
      return;
    }

    if (current.length >= limit) {
      toast.error(`${TAG_DIM_LABELS[dim]}最多选 ${limit} 个`);
      return;
    }

    onChange({ ...value, [dim]: [...current, slug] });
  }

  function handleCreate(dim: keyof TagSelectionValue) {
    const name = (drafts[dim] ?? '').trim();
    if (!name) return;

    const existing = allTags.find((tag) => tag.dim === dim && tag.name === name);
    if (existing) {
      toggle(dim, existing.slug);
      setDrafts((prev) => ({ ...prev, [dim]: '' }));
      return;
    }

    setPendingDim(dim);
    startTransition(async () => {
      const result = await createTag({
        dim,
        slug: slugifyTagName(name),
        name,
        color: pickTagColor(name),
        sort: 999,
      });

      if (!result.ok) {
        toast.error(result.error);
        setPendingDim(null);
        return;
      }

      const created: TagOption = {
        id: result.data.id,
        dim,
        slug: result.data.slug,
        name,
        color: pickTagColor(name),
        icon: null,
      };

      setExtraTags((prev) => [...prev, created]);
      onChange({ ...value, [dim]: [...value[dim], created.slug] });
      setDrafts((prev) => ({ ...prev, [dim]: '' }));
      setPendingDim(null);
      toast.success(`已新建标签「${name}」`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {TAG_DIMS.map((dim) => {
        const options = grouped.get(dim) ?? [];
        const selected = value[dim];
        const limit = MAX_TAGS_PER_DIM[dim];

        return (
          <fieldset key={dim} className="rounded-md border border-neutral-200 bg-white p-3">
            <legend className="px-1 text-xs text-neutral-500">
              {TAG_DIM_LABELS[dim]}
              <span className={cn('ml-1.5 tabular-nums', selected.length > limit ? 'text-destructive' : 'text-neutral-400')}>
                {selected.length}/{limit}
              </span>
              {dim === 'scene' ? <span className="ml-1.5 text-destructive">必选</span> : null}
            </legend>

            <div className="flex flex-wrap gap-1.5">
              {options.length === 0 ? <span className="text-xs text-neutral-400">这个维度还没有标签</span> : null}

              {options.map((tag) => {
                const active = selected.includes(tag.slug);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(dim, tag.slug)}
                    aria-pressed={active}
                    disabled={disabled}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60',
                      active ? 'text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100',
                    )}
                    style={active ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                autoComplete="off"
                spellCheck={false}
                value={drafts[dim] ?? ''}
                onChange={(event) => setDrafts((prev) => ({ ...prev, [dim]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleCreate(dim);
                  }
                }}
                disabled={disabled || pendingDim === dim}
                placeholder={`没有想要的？回车新建一个${TAG_DIM_LABELS[dim]}标签`}
                aria-label={`新建${TAG_DIM_LABELS[dim]}标签`}
                className="h-7 flex-1 rounded-md border border-dashed border-neutral-300 px-2 text-xs outline-none focus-visible:border-ring"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled || pendingDim === dim || !(drafts[dim] ?? '').trim()}
                onClick={() => handleCreate(dim)}
              >
                {pendingDim === dim ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                新建
              </Button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
