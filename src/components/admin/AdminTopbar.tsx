'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { useBreadcrumbName } from '@/components/admin/BreadcrumbName';

const LABELS: Record<string, string> = {
  admin: '后台',
  entries: '条目管理',
  new: '新建',
  edit: '编辑',
  tags: '标签管理',
  submissions: '投稿审核',
  trash: '回收站',
  imports: '导入导出',
  settings: '站点设置',
  branches: '门店管理',
  qrcodes: '二维码看板',
  clicks: '点击统计',
};

/** 形如 a648fc32-239d-4654-adf7-c949433074a1：数据库主键，不该出现在面包屑上 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useBreadcrumb(pathname: string, name: string | null): string[] {
  const segments = pathname.split('/').filter(Boolean);

  return segments.map((segment) => {
    if (LABELS[segment]) return LABELS[segment];
    if (UUID_PATTERN.test(segment)) return name ?? '条目';
    return decodeURIComponent(segment);
  });
}

export default function AdminTopbar() {
  const pathname = usePathname();
  const name = useBreadcrumbName();
  const crumbs = useBreadcrumb(pathname, name);

  return (
    <header className="sticky top-0 z-10 hidden h-14 items-center justify-between border-b border-neutral-200 bg-white/95 px-6 backdrop-blur lg:flex">
      <nav aria-label="面包屑" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm text-neutral-500">
          {crumbs.map((crumb, index) => (
            <li key={`${crumb}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden>/</span> : null}
              <span className={index === crumbs.length - 1 ? 'font-medium text-neutral-900' : undefined}>{crumb}</span>
            </li>
          ))}
        </ol>
      </nav>

      <Link
        href="/"
        target="_blank"
        rel="noopener"
        className="flex items-center gap-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-900"
      >
        查看前台
        <ExternalLink className="size-3.5" aria-hidden />
      </Link>
    </header>
  );
}
