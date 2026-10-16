import type { Metadata } from 'next';
import ImportPanel from '@/components/admin/ImportPanel';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: '导入导出',
  robots: { index: false, follow: false },
};

export default async function AdminImportsPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">导入导出</h1>
      <ImportPanel />
    </div>
  );
}
