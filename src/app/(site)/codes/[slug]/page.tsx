import type { Metadata } from 'next';
import EntryDetail from '@/components/card/EntryDetail';
import { getPublicEntryBySlug } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { loadEntryDetailPage } from '@/lib/detail-page';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublicEntryBySlug('code', slug);

  if (!entry) return { title: '找不到这份源码' };

  return {
    title: entry.name,
    description: entry.summary,
    alternates: { canonical: `/codes/${entry.slug}` },
    openGraph: { title: entry.name, description: entry.summary, url: `/codes/${entry.slug}`, type: 'article' },
  };
}

export default async function CodeDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { detail, recommendations, cityOf } = await loadEntryDetailPage('code', slug);

  await trackPageView({ path: `/codes/${detail.slug}`, kind: 'detail', entryId: detail.id });

  return <EntryDetail detail={detail} recommendations={recommendations} cityOf={cityOf} />;
}
