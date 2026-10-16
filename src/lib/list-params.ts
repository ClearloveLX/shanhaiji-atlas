import type { EntrySort, TagMatchMode } from '@/db/queries';

/** 列表页/标签页共用的 searchParams 解析：多值用英文逗号 */
export function parseListQuery(sp: Record<string, string | string[] | undefined>): {
  tagKeys: string[];
  sort: EntrySort;
  tagMatch: TagMatchMode;
} {
  const tagKeys: string[] = [];

  for (const dim of ['topic', 'scene', 'attr', 'platform', 'price', 'quality']) {
    const raw = sp[dim];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;

    for (const slug of value.split(',')) {
      const trimmed = slug.trim();
      if (trimmed) tagKeys.push(`${dim}/${trimmed}`);
    }
  }

  // 默认「推荐顺序」：站长在后台用 ↑↓ 调出来的顺序。
  // 没调过的条目权重都是 0，会退回按收录时间排，所以不调就和以前完全一样。
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort: EntrySort =
    sortRaw === 'name' || sortRaw === 'featured' || sortRaw === 'newest' || sortRaw === 'updated' || sortRaw === 'manual'
      ? sortRaw
      : 'manual';

  // 默认「全部满足」（强关联）：加一个标签就少一批，符合「逐层缩小范围」的直觉。
  // 要「沾一个就出现」就在 URL 上写 match=any。
  const matchRaw = Array.isArray(sp.match) ? sp.match[0] : sp.match;
  const tagMatch: TagMatchMode = matchRaw === 'any' ? 'any' : 'all';

  return { tagKeys, sort, tagMatch };
}

export function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
