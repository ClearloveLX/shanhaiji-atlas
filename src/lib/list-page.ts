import type { EntryCardData } from '@/components/card/EntryCard';
import type { FilterGroup } from '@/components/filter/FilterPanel';
import { getPublicTagCountsByType, type EntryWithTags, type TagWithCount } from '@/db/queries';
import { TAG_DIM_LABELS } from '@/lib/tags';
import type { TagDim } from '@/types';

/**
 * 列表页共用的组装逻辑（服务端）：
 * 把「查询结果 + 标签计数」翻译成 EntryCard 和 FilterPanel 需要的数据。
 * 计数来自 getPublicTagCountsByType —— 只统计公开条目，私密维度的标签也不会出现。
 */

const FILTER_DIMS: TagDim[] = ['topic', 'scene', 'attr', 'platform', 'price', 'quality'];

export function toCardItem(item: EntryWithTags): EntryCardData {
  return {
    id: item.id,
    type: item.type,
    linkMode: item.linkMode,
    slug: item.slug,
    name: item.name,
    nameEn: item.nameEn,
    summary: item.summary,
    url: item.url,
    icon: item.icon,
    featured: item.featured,
    status: item.status,
    tags: item.tags,
  };
}

export function toCardData(items: EntryWithTags[]): EntryCardData[] {
  return items.map(toCardItem);
}

/** 维度 → 标签分组（含计数），空标签也渲染但计数为 0 */
export function buildFilterGroups(tagCounts: TagWithCount[]): { groups: FilterGroup[]; labels: Record<string, string> } {
  const groups: FilterGroup[] = FILTER_DIMS.map((dim) => ({
    dim,
    label: TAG_DIM_LABELS[dim] ?? dim,
    tags: tagCounts
      .filter((tag) => tag.dim === dim)
      .map((tag) => ({ slug: tag.slug, name: tag.name, color: tag.color, count: tag.count })),
  }));

  const labels: Record<string, string> = {};
  for (const tag of tagCounts) {
    labels[`${tag.dim}/${tag.slug}`] = tag.name;
  }

  return { groups, labels };
}

/** 列表页统一入口：拿分组 + 计数 + 标签名映射 */
export async function getListPageData(type: string | null): Promise<{
  groups: FilterGroup[];
  labels: Record<string, string>;
  tagCounts: TagWithCount[];
}> {
  const tagCounts = await getPublicTagCountsByType(type);
  const { groups, labels } = buildFilterGroups(tagCounts);
  return { groups, labels, tagCounts };
}
