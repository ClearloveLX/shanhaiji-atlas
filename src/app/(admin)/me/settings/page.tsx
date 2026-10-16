import type { Metadata } from 'next';
import SettingsForm from '@/components/admin/SettingsForm';
import { getSiteSettings } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: '站长区 · 设置', robots: { index: false, follow: false } };

export default async function MeSettingsPage() {
  await requireAdmin();

  const settings = await getSiteSettings();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">站点设置</h1>
      <div className="max-w-2xl">
        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
