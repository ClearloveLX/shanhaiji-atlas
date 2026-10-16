import type { Metadata } from 'next';
import EntryDetail from '@/components/card/EntryDetail';
import { getPublicEntryBySlug } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { loadEntryDetailPage } from '@/lib/detail-page';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublicEntryBySlug('site', slug);

  if (!entry) return { title: '找不到这个站点' };

  return {
    title: entry.name,
    description: entry.summary,
    alternates: { canonical: `/sites/${entry.slug}` },
    openGraph: { title: entry.name, description: entry.summary, url: `/sites/${entry.slug}`, type: 'article' },
  };
}

export default async function SiteDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { detail, recommendations, cityOf } = await loadEntryDetailPage('site', slug);

  await trackPageView({ path: `/sites/${detail.slug}`, kind: 'detail', entryId: detail.id });

  return <EntryDetail detail={detail} recommendations={recommendations} cityOf={cityOf} />;
}
