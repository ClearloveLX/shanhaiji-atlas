import type { Metadata } from 'next';
import EntryDetail from '@/components/card/EntryDetail';
import { getPublicEntryBySlug } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { loadEntryDetailPage } from '@/lib/detail-page';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublicEntryBySlug('tool', slug);

  if (!entry) return { title: '找不到这个工具' };

  return {
    title: entry.name,
    description: entry.summary,
    alternates: { canonical: `/tools/${entry.slug}` },
    openGraph: { title: entry.name, description: entry.summary, url: `/tools/${entry.slug}`, type: 'article' },
  };
}

export default async function ToolDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { detail, recommendations, cityOf } = await loadEntryDetailPage('tool', slug);

  await trackPageView({ path: `/tools/${detail.slug}`, kind: 'detail', entryId: detail.id });

  return <EntryDetail detail={detail} recommendations={recommendations} cityOf={cityOf} />;
}
