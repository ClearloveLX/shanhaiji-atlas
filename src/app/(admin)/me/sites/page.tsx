import type { Metadata } from 'next';
import MeEntryList from '@/components/admin/MeEntryList';
import { getAdminEntries } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: '站长区 · 站点', robots: { index: false, follow: false } };

export default async function MeSitesPage() {
  await requireAdmin();

  const paged = await getAdminEntries({ type: 'site', pageSize: 200, sort: 'updated' });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        站点
        <span className="ml-2 text-sm font-normal text-neutral-500">共 {paged.total} 条</span>
      </h1>
      <MeEntryList entries={paged.items} />
    </div>
  );
}
