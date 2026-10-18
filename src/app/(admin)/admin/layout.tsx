import type { Metadata } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminTopbar from '@/components/admin/AdminTopbar';
import { BreadcrumbProvider } from '@/components/admin/BreadcrumbName';
import { getAdminDashboardStats } from '@/db/queries';
import { auth, requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: '后台',
  robots: { index: false, follow: false },
};

/**
 * 后台布局：左侧固定侧边栏 220px，移动端收进抽屉；顶部一条细栏放面包屑和「查看前台」。
 * 中性灰调、信息密度高、圆角 8px，不做主色大面积铺色。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 双保险：middleware 只看 cookie，这里再确认一次会话
  await requireAdmin();
  const [stats, session] = await Promise.all([getAdminDashboardStats(), auth()]);

  return (
    <BreadcrumbProvider>
      <div className="min-h-dvh bg-neutral-100 text-neutral-900">
        <AdminSidebar
          pendingSubmissions={stats.pendingSubmissions}
          staleCount={stats.staleCount}
          email={session?.user?.email ?? ''}
        />
        <div className="lg:pl-[220px]">
          <AdminTopbar />
          <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">{children}</main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
