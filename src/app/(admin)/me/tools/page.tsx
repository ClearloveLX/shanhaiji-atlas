import type { Metadata } from 'next';
import MeEntryList from '@/components/admin/MeEntryList';
import { getAdminEntries } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: '站长区 · 工具', robots: { index: false, follow: false } };

/** 全量工具列表：三种可见性都显示 */
export default async function MeToolsPage() {
  await requireAdmin();

  const paged = await getAdminEntries({ type: 'tool', pageSize: 200, sort: 'updated' });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        工具
        <span className="ml-2 text-sm font-normal text-neutral-500">共 {paged.total} 条</span>
      </h1>
      <MeEntryList entries={paged.items} />
    </div>
  );
}
