import type { Metadata } from 'next';
import SettingsForm from '@/components/admin/SettingsForm';
import { getSiteSettings } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: '站点设置',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  await requireAdmin();

  const settings = await getSiteSettings();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">站点设置</h1>

      <div className="max-w-2xl">
        <SettingsForm settings={settings} />
      </div>

      <p className="max-w-2xl text-xs text-neutral-500">
        管理员账号存在数据库的 settings 表里（key = admin）。忘记密码的话：改 .env.local 里的 ADMIN_PASSWORD，
        然后重跑 <code className="rounded bg-neutral-100 px-1">pnpm db:seed</code>。
      </p>
    </div>
  );
}
