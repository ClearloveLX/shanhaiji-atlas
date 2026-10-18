import type { Metadata } from 'next';
import EntryListPage from '@/components/card/EntryListPage';
import { getPublicEntries, getPublicPrimaryCityMap } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { getListPageData, toCardData } from '@/lib/list-page';
import { parseListQuery } from '@/lib/list-params';
import { listTitle } from '@/lib/tags';

export const metadata: Metadata = {
  title: '源码分享',
  description: '开源、能直接读也能直接抄的项目：前端、后端、工具库与示例代码，按场景和属性筛。',
  alternates: { canonical: '/codes' },
};

export default async function CodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await trackPageView({ path: '/codes', kind: 'list' });

  const sp = await searchParams;
  const { tagKeys, sort, tagMatch } = parseListQuery(sp);

  const [paged, listData] = await Promise.all([
    getPublicEntries({ type: 'code', tagKeys, tagMatch, sort, pageSize: 60 }),
    getListPageData('code'),
  ]);

  const cards = toCardData(paged.items);
  const cityOf = await getPublicPrimaryCityMap(cards.map((card) => card.id));

  return (
    <EntryListPage
      title={listTitle('code')}
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
