import Link from 'next/link';
import type { Metadata } from 'next';
import { Map as MapIcon } from 'lucide-react';
import EntryListPage from '@/components/card/EntryListPage';
import { getPublicEntries, getPublicPrimaryCityMap } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { getListPageData, toCardData } from '@/lib/list-page';
import { parseListQuery } from '@/lib/list-params';
import { listTitle } from '@/lib/tags';

export const metadata: Metadata = {
  title: '好店分享',
  description: '线上店与线下实体店：能逛、能买、能去的都收在这里，线下店带地址和导航。',
  alternates: { canonical: '/shops' },
};

export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { tagKeys, sort, tagMatch } = parseListQuery(sp);

  await trackPageView({ path: '/shops', kind: 'list' });

  const [paged, listData] = await Promise.all([
    getPublicEntries({ type: 'shop', tagKeys, tagMatch, sort, pageSize: 60 }),
    getListPageData('shop'),
  ]);

  const cards = toCardData(paged.items);
  const cityOf = await getPublicPrimaryCityMap(cards.map((card) => card.id));

  return (
    <div className="flex flex-col">
      <div className="shell pt-10 sm:pt-12">
        <Link
          href="/shops/map"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm transition-colors duration-150 hover:border-foreground/20 hover:bg-accent"
        >
          <MapIcon className="size-4" aria-hidden />
          在地图上查看线下好店
        </Link>
      </div>

      <EntryListPage
        title={listTitle('shop')}
        total={paged.total}
        entries={cards}
        groups={listData.groups}
        labels={listData.labels}
        cities={cityOf}
        sort={sort}
        emptyHint="调整标签组合，或清空筛选查看全部。"
      />
    </div>
  );
}
