'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { TagMatchMode } from '@/db/queries';
import type { TagDim } from '@/types';

export type TagFilterState = Record<TagDim, string[]>;

const DIMS: TagDim[] = ['topic', 'scene', 'attr', 'platform', 'price', 'quality'];

const EMPTY: TagFilterState = { topic: [], scene: [], attr: [], platform: [], price: [], quality: [] };

/**
 * 筛选状态 ⇄ URL query。
 * 只负责改 URL，真正过滤在服务端做（页面是 Server Component，从 searchParams 读条件去查库）。
 * 多值用英文逗号：?scene=work,study&platform=web&match=all
 */
export function useTagFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = useMemo<TagFilterState>(() => {
    const state: TagFilterState = { ...EMPTY };

    for (const dim of DIMS) {
      const raw = searchParams.get(dim);
      if (!raw) continue;
      state[dim] = raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return state;
  }, [searchParams]);

  /** 多标签匹配方式，默认 all（强关联），与 parseListQuery 保持一致 */
  const tagMatch: TagMatchMode = searchParams.get('match') === 'any' ? 'any' : 'all';

  const push = useCallback(
    (next: TagFilterState, extra?: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const dim of DIMS) {
        const value = next[dim].join(',');
        if (value) params.set(dim, value);
        else params.delete(dim);
      }

      for (const [key, value] of Object.entries(extra ?? {})) {
        if (value) params.set(key, value);
        else params.delete(key);
      }

      // 筛选变了就回第 1 页
      params.delete('page');

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggle = useCallback(
    (dim: TagDim, slug: string) => {
      const current = selected[dim];
      const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
      push({ ...selected, [dim]: next });
    },
    [push, selected],
  );

  const remove = useCallback(
    (dim: TagDim, slug: string) => {
      push({ ...selected, [dim]: selected[dim].filter((item) => item !== slug) });
    },
    [push, selected],
  );

  const clearAll = useCallback(() => {
    push(EMPTY);
  }, [push]);

  const setTagMatch = useCallback(
    (mode: TagMatchMode) => {
      // all 是默认值，不写进 URL，链接干净一点
      push(selected, { match: mode === 'all' ? undefined : mode });
    },
    [push, selected],
  );

  const isSelected = useCallback((dim: TagDim, slug: string) => selected[dim].includes(slug), [selected]);

  const activeCount = DIMS.reduce((sum, dim) => sum + selected[dim].length, 0);

  return { selected, toggle, remove, clearAll, isSelected, activeCount, push, tagMatch, setTagMatch };
}

export { EMPTY as EMPTY_TAG_FILTER };
