'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownUp,
  ChartNoAxesColumn,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MapPinned,
  Menu,
  MousePointerClick,
  QrCode,
  Settings,
  Tags as TagsIcon,
  Trash2,
} from 'lucide-react';
import { logoutAction } from '@/actions/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** 需要显示红点的数量 */
  badge?: number;
};

export type AdminSidebarProps = {
  pendingSubmissions: number;
  staleCount: number;
  email: string;
};

function buildNav({ pendingSubmissions, staleCount }: AdminSidebarProps): NavItem[] {
  return [
    { href: '/admin', label: '仪表盘', icon: LayoutDashboard },
    { href: '/admin/entries', label: '条目管理', icon: ListChecks, badge: staleCount },
    { href: '/admin/tags', label: '标签管理', icon: TagsIcon },
    { href: '/admin/submissions', label: '投稿审核', icon: Inbox, badge: pendingSubmissions },
    { href: '/admin/analytics', label: '访问统计', icon: ChartNoAxesColumn },
    { href: '/admin/clicks', label: '点击统计', icon: MousePointerClick },
    { href: '/admin/branches', label: '门店管理', icon: MapPinned },
    { href: '/admin/qrcodes', label: '二维码看板', icon: QrCode },
    { href: '/admin/trash', label: '回收站', icon: Trash2 },
    { href: '/admin/imports', label: '导入导出', icon: ArrowDownUp },
    { href: '/admin/settings', label: '站点设置', icon: Settings },
  ];
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="后台导航">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-neutral-200/70 font-medium text-neutral-900' : 'text-neutral-600 hover:bg-neutral-200/50',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <Badge variant="destructive" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]">
                {item.badge > 99 ? '99+' : item.badge}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminSidebar(props: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = buildNav(props);

  return (
    <>
      {/* 移动端顶栏 */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 lg:hidden">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" aria-label="打开后台菜单">
              <Menu className="size-4" aria-hidden />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[260px] p-4">
            <DialogTitle className="text-sm">后台菜单</DialogTitle>
            <NavList items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
        <span className="text-sm font-medium">山海集 · 后台</span>
      </div>

      {/* 桌面端侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[220px] flex-col border-r border-neutral-200 bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-neutral-200 px-4">
          <Link href="/admin" className="text-sm font-semibold">
            山海集 · 后台
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <NavList items={items} pathname={pathname} />
        </div>

        <div className="border-t border-neutral-200 p-3">
          <p className="truncate px-1 pb-2 text-xs text-neutral-500" title={props.email}>
            {props.email || '未登录'}
          </p>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2 text-neutral-600">
              <LogOut className="size-4" aria-hidden />
              退出登录
            </Button>
          </form>
        </div>
      </aside>
    </>
  );
}
