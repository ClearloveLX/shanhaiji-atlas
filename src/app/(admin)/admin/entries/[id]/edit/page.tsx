import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import EntryForm from '@/components/admin/EntryForm';
import { getAdminAllTags, getAdminEntryById } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { buildEntryFormValues } from '@/lib/entries';
import { listSegment } from '@/lib/tags';
import { formatRelative } from '@/lib/utils';
import { listToolComponents } from '@/tools/registry';

export const metadata: Metadata = {
  title: '编辑条目',
  robots: { index: false, follow: false },
};

export default async function AdminEntryEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const entry = await getAdminEntryById(id);

  if (!entry) notFound();

  const allTags = await getAdminAllTags();

  return (
    <EntryForm
      mode="edit"
      entryId={entry.id}
      tags={allTags.map((tag) => ({
        id: tag.id,
        dim: tag.dim,
        slug: tag.slug,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
      }))}
      components={listToolComponents()}
      defaultValues={buildEntryFormValues(entry)}
      updatedLabel={formatRelative(entry.updatedAt)}
      previewHref={`/${listSegment(entry.type)}/${entry.slug}`}
    />
  );
}
