import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { siteConfig } from '@/lib/site-config';

/**
 * 站长区外框。
 * /admin 是管理台（表格 + 表单，用来改），/me 是站长视角的前台（卡片，用来逛）。
 * 每个页面自己还会再 requireAdmin() 一次（双保险）。
 */
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const nav = [
    { href: '/me', label: '私藏首页' },
    { href: '/me/tools', label: '工具' },
    { href: '/me/sites', label: '站点' },
    { href: '/me/shops', label: '店铺' },
    { href: '/me/notes', label: '笔记' },
    { href: '/me/search', label: '全量搜索' },
    { href: '/me/settings', label: '设置' },
  ];

  return (
    <div className="min-h-dvh bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <span className="text-sm font-semibold">站长视图 · {siteConfig.fullName}</span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
            这里能看到全部三种可见性
          </span>

          <nav aria-label="站长区导航" className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/" className="text-neutral-600 hover:text-neutral-900">
              返回公开站
            </Link>
            <Link href="/admin" className="text-neutral-600 hover:text-neutral-900">
              后台
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
