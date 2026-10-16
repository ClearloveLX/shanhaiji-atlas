import type { Metadata } from 'next';
import EntryDetail from '@/components/card/EntryDetail';
import ShopSidebar from '@/components/card/ShopSidebar';
import { getPublicEntryBySlug } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { loadEntryDetailPage } from '@/lib/detail-page';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublicEntryBySlug('shop', slug);

  if (!entry) return { title: '找不到这家店' };

  return {
    title: entry.name,
    description: entry.summary,
    alternates: { canonical: `/shops/${entry.slug}` },
    openGraph: { title: entry.name, description: entry.summary, url: `/shops/${entry.slug}`, type: 'article' },
  };
}

export default async function ShopDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { detail, recommendations, cityOf } = await loadEntryDetailPage('shop', slug);

  await trackPageView({ path: `/shops/${detail.slug}`, kind: 'detail', entryId: detail.id });

  // 线下店详情页：主区域照旧，侧栏换成门店列表 / 导航按钮 / 静态地图 / 「在地图上找最近的」/ 二维码。
  // 线上店（linkMode=external）如果填了地图搜索词（有实体店的连锁），也给同一套侧栏。
  const hasSidebar = detail.linkMode === 'place' || Boolean(detail.mapQuery);

  return (
    <EntryDetail
      detail={detail}
      recommendations={recommendations}
      cityOf={cityOf}
      sidebar={hasSidebar ? <ShopSidebar detail={detail} /> : undefined}
    />
  );
}
