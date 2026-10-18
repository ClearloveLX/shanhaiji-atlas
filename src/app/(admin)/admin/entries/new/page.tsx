import type { Metadata } from 'next';
import EntryForm from '@/components/admin/EntryForm';
import { getAdminAllTags, getAdminSubmissionById, getSiteSettings } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { asEntryType, buildEmptyEntryFormValues } from '@/lib/entries';
import { listToolComponents } from '@/tools/registry';

export const metadata: Metadata = {
  title: '新建条目',
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function AdminEntryNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const modeParam = first(sp.mode);
  const linkMode = modeParam === 'internal' || modeParam === 'place' ? modeParam : 'external';
  const submissionId = first(sp.fromSubmission);

  const [allTags, submission, settings] = await Promise.all([
    getAdminAllTags(),
    submissionId ? getAdminSubmissionById(submissionId) : Promise.resolve(null),
    getSiteSettings(),
  ]);

  const defaultValues = buildEmptyEntryFormValues(
    linkMode,
    settings.defaultVisibility === 'unlisted' || settings.defaultVisibility === 'private'
      ? settings.defaultVisibility
      : 'public',
  );

  // 从投稿「通过」跳过来：把投稿内容预填进表单，保存后会自动把投稿标记为已通过
  if (submission) {
    if (submission.url) {
      defaultValues.url = submission.url;
      defaultValues.linkMode = 'external';
      defaultValues.type = asEntryType(submission.type ?? '');
    }
    defaultValues.name = submission.name;
    defaultValues.summary = submission.reason ?? '';
    defaultValues.note = submission.reason ? `来自投稿：${submission.reason}` : '';
  }

  return (
    <EntryForm
      mode="create"
      submissionId={submission ? submission.id : undefined}
      tags={allTags.map((tag) => ({
        id: tag.id,
        dim: tag.dim,
        slug: tag.slug,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
      }))}
      components={listToolComponents()}
      defaultValues={defaultValues}
    />
  );
}
