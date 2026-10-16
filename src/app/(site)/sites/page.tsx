import type { Metadata } from 'next';
import EntryListPage from '@/components/card/EntryListPage';
import { getPublicEntries, getPublicPrimaryCityMap } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { getListPageData, toCardData } from '@/lib/list-page';
import { parseListQuery } from '@/lib/list-params';
import { listTitle } from '@/lib/tags';

export const metadata: Metadata = {
  title: '常用站点',
  description: '值得放进收藏夹的站点：内容社区、查询工具、生活服务，按场景和属性筛。',
  alternates: { canonical: '/sites' },
};

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { tagKeys, sort, tagMatch } = parseListQuery(sp);

  await trackPageView({ path: '/sites', kind: 'list' });

  const [paged, listData] = await Promise.all([
    getPublicEntries({ type: 'site', tagKeys, tagMatch, sort, pageSize: 60 }),
    getListPageData('site'),
  ]);

  const cards = toCardData(paged.items);
  const cityOf = await getPublicPrimaryCityMap(cards.map((card) => card.id));

  return (
    <EntryListPage
      title={listTitle('site')}
      total={paged.total}
      entries={cards}
      groups={listData.groups}
      labels={listData.labels}
      cities={cityOf}
      sort={sort}
      emptyHint="调整标签组合，或清空筛选查看全部。"
    />
  );
}
