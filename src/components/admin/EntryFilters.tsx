'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, Plus, Search, X } from 'lucide-react';
import TagPicker, { EMPTY_TAG_SELECTION, type TagOption, type TagSelectionValue } from '@/components/admin/TagPicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { TAG_DIMS } from '@/lib/tags';
import { cn } from '@/lib/utils';
import type { TagDim } from '@/types';

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'tool', label: '工具分享' },
  { value: 'site', label: '站点分享' },
  { value: 'code', label: '源码分享' },
  { value: 'shop', label: '好店分享' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'stale', label: '疑似失效' },
  { value: 'dead', label: '已失效' },
];

const VISIBILITY_OPTIONS = [
  { value: '', label: '全部可见性' },
  { value: 'public', label: '公开' },
  { value: 'unlisted', label: '不列出' },
  { value: 'private', label: '私密' },
];

const MODE_OPTIONS = [
  { value: '', label: '全部形态' },
  { value: 'external', label: '外部链接' },
  { value: 'internal', label: '基本自研' },
  { value: 'place', label: '线下好店' },
];

const SORT_OPTIONS = [
  { value: 'manual', label: '手动排序' },
  { value: 'updated', label: '按更新时间' },
  { value: 'newest', label: '按收录时间' },
  { value: 'name', label: '按名称' },
  { value: 'featured', label: '精选优先' },
];

function selectionFromKeys(keys: string[]): TagSelectionValue {
  const next: TagSelectionValue = { ...EMPTY_TAG_SELECTION };
  for (const key of keys) {
    const [dim, slug] = key.split('/');
    if ((TAG_DIMS as readonly string[]).includes(dim)) {
      next[dim as TagDim] = [...next[dim as TagDim], slug];
    }
  }
  return next;
}

function keysFromSelection(value: TagSelectionValue): string[] {
  const keys: string[] = [];
  for (const dim of TAG_DIMS) {
    for (const slug of value[dim]) keys.push(`${dim}/${slug}`);
  }
  return keys;
}

/** 条目列表的筛选工具条：关键字防抖 + 类型/状态/形态 + 标签弹窗 + 排序，全部写进 URL */
export default function EntryFilters({
  tags,
  keyword,
  type,
  status,
  linkMode,
  visibility,
  sort,
  tagKeys,
  total,
}: {
  tags: TagOption[];
  keyword: string;
  type: string;
  status: string;
  linkMode: string;
  visibility: string;
  sort: string;
  tagKeys: string[];
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [keywordInput, setKeywordInput] = useState(keyword);
  const debouncedKeyword = useDebounce(keywordInput, 300);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagSelection, setTagSelection] = useState<TagSelectionValue>(() => selectionFromKeys(tagKeys));

  const tagNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of tags) map.set(`${tag.dim}/${tag.slug}`, tag.name);
    return map;
  }, [tags]);

  function push(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.delete('page');
    const query = params.toString();
    router.replace(`/admin/entries${query ? `?${query}` : ''}`);
  }

  // 关键字防抖 300ms 后写进 URL
  useEffect(() => {
    if (debouncedKeyword === keyword) return;
    push({ q: debouncedKeyword || undefined });
    // push 依赖 searchParams，用 debouncedKeyword/keyword 作为触发条件即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <Input
            autoComplete="off"
            spellCheck={false}
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="搜名称 / 简介 / 链接"
            aria-label="搜索条目"
            className="pl-8"
          />
        </div>

        <select
          value={type}
          onChange={(event) => push({ type: event.target.value || undefined })}
          aria-label="按类型筛选"
          className="h-9 rounded-md border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={linkMode}
          onChange={(event) => push({ mode: event.target.value || undefined })}
          aria-label="按形态筛选"
          className="h-9 rounded-md border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring"
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => push({ status: event.target.value || undefined })}
          aria-label="按状态筛选"
          className="h-9 rounded-md border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={visibility}
          onChange={(event) => push({ visibility: event.target.value || undefined })}
          aria-label="按可见性筛选"
          className="h-9 rounded-md border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring"
        >
          {VISIBILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => push({ sort: event.target.value === 'manual' ? undefined : event.target.value })}
          aria-label="排序方式"
          className="h-9 rounded-md border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setTagSelection(selectionFromKeys(tagKeys));
            setTagDialogOpen(true);
          }}
        >
          <Filter className="size-4" aria-hidden />
          标签筛选
          {tagKeys.length > 0 ? <span className="text-xs text-neutral-500">{tagKeys.length}</span> : null}
        </Button>

        <Button asChild>
          <Link href="/admin/entries/new">
            <Plus className="size-4" aria-hidden />
            新建条目
          </Link>
        </Button>
      </div>

      {tagKeys.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {tagKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => push({ tags: tagKeys.filter((item) => item !== key).join(',') || undefined })}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs transition-colors hover:bg-neutral-100',
              )}
            >
              {tagNameByKey.get(key) ?? key}
              <X className="size-3" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            onClick={() => push({ tags: undefined })}
            className="text-xs text-neutral-500 underline-offset-2 hover:underline"
          >
            清空标签筛选
          </button>
          <span className="text-xs text-neutral-400">共 {total} 条</span>
        </div>
      ) : null}

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>按标签筛选</DialogTitle>
          </DialogHeader>

          <TagPicker tags={tags} value={tagSelection} onChange={setTagSelection} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTagDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                const keys = keysFromSelection(tagSelection);
                push({ tags: keys.join(',') || undefined });
                setTagDialogOpen(false);
              }}
            >
              应用筛选
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
