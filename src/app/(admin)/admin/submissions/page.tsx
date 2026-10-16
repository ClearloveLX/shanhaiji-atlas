import type { Metadata } from 'next';
import SubmissionsBoard, { type SubmissionRow } from '@/components/admin/SubmissionsBoard';
import { getAdminSubmissions } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { formatRelative, toDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: '投稿审核',
  robots: { index: false, follow: false },
};

const OVERDUE_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();

  const { status: statusParam } = await searchParams;
  const status = statusParam === 'approved' || statusParam === 'rejected' ? statusParam : 'pending';

  const [paged, pending, approved, rejected] = await Promise.all([
    getAdminSubmissions({ status, pageSize: 100 }),
    getAdminSubmissions({ status: 'pending', pageSize: 1 }),
    getAdminSubmissions({ status: 'approved', pageSize: 1 }),
    getAdminSubmissions({ status: 'rejected', pageSize: 1 }),
  ]);

  const rows: SubmissionRow[] = paged.items.map((item) => {
    const createdAt = toDate(item.createdAt);
    const overdue = item.status === 'pending' && Date.now() - createdAt.getTime() > OVERDUE_MS;

    return {
      id: item.id,
      kind: item.kind,
      name: item.name,
      url: item.url,
      type: item.type,
      reason: item.reason,
      contact: item.contact,
      status: item.status,
      createdLabel: formatRelative(createdAt),
      reviewedLabel: item.reviewedAt ? formatRelative(item.reviewedAt) : null,
      overdue,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">投稿审核</h1>
        <span className="text-sm text-neutral-500">待审 {pending.total} 条</span>
      </div>

      <SubmissionsBoard
        rows={rows}
        status={status}
        counts={{ pending: pending.total, approved: approved.total, rejected: rejected.total }}
      />
    </div>
  );
}
