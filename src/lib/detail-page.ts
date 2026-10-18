import { notFound } from 'next/navigation';
import type { EntryCardData } from '@/components/card/EntryCard';
import { getPublicEntries, getPublicEntryBySlug, getPublicPrimaryCityMap, type EntryDetail } from '@/db/queries';
import { toCardData } from '@/lib/list-page';

/**
 * 详情页共用的取数逻辑：条目详情 + 同场景推荐 4 条 + 主门店城市。
 * 四个详情页（/tools /sites /codes /shops）都调它，前端只是外壳不同。
 */
export async function loadEntryDetailPage(
  type: string,
  slug: string,
): Promise<{ detail: EntryDetail; recommendations: EntryCardData[]; cityOf: Record<string, string | null> }> {
  const detail = await getPublicEntryBySlug(type, slug);

  if (!detail) notFound();

  const sceneTag = detail.tags.find((tag) => tag.dim === 'scene');

  const related = sceneTag
    ? (await getPublicEntries({ tagKeys: [`scene/${sceneTag.slug}`], pageSize: 8, sort: 'featured' })).items
        .filter((item) => item.id !== detail.id && item.status === 'active')
        .slice(0, 4)
    : [];

  const cards = toCardData(related);
  const cityOf = await getPublicPrimaryCityMap(cards.map((card) => card.id));

  return { detail, recommendations: cards, cityOf };
}
