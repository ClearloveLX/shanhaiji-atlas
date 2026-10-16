import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAG_ENTRIES, CACHE_TAG_TAGS } from '@/db/queries';

/**
 * ★ 全项目最重要的一个文件。
 * 任何写库的 Server Action 结尾都必须调这里的函数，否则前台看不到更新。
 */

const TYPE_SEGMENTS: Record<string, string> = {
  tool: 'tools',
  site: 'sites',
  shop: 'shops',
};

/** 条目类型 → 列表页路径段（tool → tools） */
export function listSegmentOf(type: string): string {
  return TYPE_SEGMENTS[type] ?? 'tools';
}

export type EntryPathLike = {
  type: string;
  slug: string;
  /** 复合形式 'scene/work'，改了标签也要刷新对应标签页 */
  tagKeys?: string[];
};

function revalidateEntryOwnPaths(entry: EntryPathLike): void {
  const segment = listSegmentOf(entry.type);
  revalidatePath(`/${segment}`, 'page');
  revalidatePath(`/${segment}/${entry.slug}`, 'page');
}

function revalidateTagPathsOf(tagKeys: string[] | undefined): void {
  if (!tagKeys || tagKeys.length === 0) return;
  for (const key of tagKeys) {
    const [dim, slug] = key.split('/');
    if (!dim || !slug) continue;
    revalidatePath(`/tags/${dim}/${slug}`, 'page');
  }
}

/**
 * 条目写库后调用。
 * previous 用于「公开改私密」这类换 URL 空间的场景：改之前和改之后的路径都要刷（D9）。
 */
export function revalidateEntryPaths(entry: EntryPathLike, previous?: EntryPathLike): void {
  revalidatePath('/', 'page');
  revalidateEntryOwnPaths(entry);
  if (previous) revalidateEntryOwnPaths(previous);

  revalidatePath('/tags', 'page');
  revalidateTagPathsOf(entry.tagKeys);
  revalidateTagPathsOf(previous?.tagKeys);

  revalidatePath('/search', 'page');
  revalidatePath('/sitemap.xml');
  revalidatePath('/feed.xml');

  revalidateTag(CACHE_TAG_ENTRIES);
}

/** 标签写库后调用（改名、改颜色、合并、排序） */
export function revalidateTagPaths(tag: { dim: string; slug: string }): void {
  revalidatePath('/tags', 'page');
  revalidatePath(`/tags/${tag.dim}/${tag.slug}`, 'page');
  revalidateTag(CACHE_TAG_TAGS);
  revalidateTag(CACHE_TAG_ENTRIES);
}

/** 批量操作 / 导入之后调用：全部列表页和聚合页一起刷 */
export function revalidateSiteWide(): void {
  for (const path of ['/', '/tools', '/sites', '/shops', '/tags', '/search']) {
    revalidatePath(path, 'page');
  }
  revalidatePath('/sitemap.xml');
  revalidatePath('/feed.xml');
  revalidateTag(CACHE_TAG_ENTRIES);
  revalidateTag(CACHE_TAG_TAGS);
}
