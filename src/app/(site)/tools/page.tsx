import type { Metadata } from 'next';
import EntryListPage from '@/components/card/EntryListPage';
import { getPublicEntries, getPublicPrimaryCityMap } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { getListPageData, toCardData } from '@/lib/list-page';
import { parseListQuery } from '@/lib/list-params';
import { listTitle } from '@/lib/tags';

export const metadata: Metadata = {
  title: '在线工具',
  description: '能直接解决问题的在线工具：设计、图片、效率、开发，按场景和属性筛。',
  alternates: { canonical: '/tools' },
};

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await trackPageView({ path: '/tools', kind: 'list' });

  const sp = await searchParams;
  const { tagKeys, sort, tagMatch } = parseListQuery(sp);

  const [paged, listData] = await Promise.all([
    getPublicEntries({ type: 'tool', tagKeys, tagMatch, sort, pageSize: 60 }),
    getListPageData('tool'),
  ]);

  const cards = toCardData(paged.items);
  const cityOf = await getPublicPrimaryCityMap(cards.map((card) => card.id));

  return (
    <EntryListPage
      title={listTitle('tool')}
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
