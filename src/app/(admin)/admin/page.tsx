import Link from 'next/link';
import { AlertTriangle, CalendarPlus, Eye, Inbox, Library, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminDashboardStats, getAdminRecentEntries, getAdminRecentLinkFailures } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { formatRelative } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  tool: '工具',
  site: '站点',
  shop: '店铺',
};

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [stats, recentEntries, failures] = await Promise.all([
    getAdminDashboardStats(),
    getAdminRecentEntries(8),
    getAdminRecentLinkFailures(5),
  ]);

  const cards = [
    { label: '总收录', value: stats.total, href: '/admin/entries', icon: Library },
    { label: '本月新增', value: stats.addedThisMonth, href: '/admin/entries?sort=newest', icon: CalendarPlus },
    { label: '待审投稿', value: stats.pendingSubmissions, href: '/admin/submissions', icon: Inbox },
    { label: '疑似失效', value: stats.staleCount, href: '/admin/entries?status=stale', icon: AlertTriangle },
  ];

  const trafficCards = [
    { label: '今日访客', value: stats.todayVisitors, hint: '按天去重', icon: Users },
    { label: '今日浏览', value: stats.todayViews, hint: '页面浏览量', icon: Eye },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">仪表盘</h1>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Card className="gap-2 rounded-lg py-4 transition-shadow hover:shadow-md">
                <CardHeader className="flex-row items-center justify-between gap-2 px-4">
                  <CardTitle className="text-sm font-normal text-neutral-500">{card.label}</CardTitle>
                  <Icon className="size-4 text-neutral-400" aria-hidden />
                </CardHeader>
                <CardContent className="px-4">
                  <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* 今天有多少人看：数据来自服务端记录，见 docs/DATA-MODEL.md 4.5 */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {trafficCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href="/admin/analytics"
              className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Card className="gap-2 rounded-lg py-4 transition-shadow hover:shadow-md">
                <CardHeader className="flex-row items-center justify-between gap-2 px-4">
                  <CardTitle className="text-sm font-normal text-neutral-500">{card.label}</CardTitle>
                  <Icon className="size-4 text-neutral-400" aria-hidden />
                </CardHeader>
                <CardContent className="px-4">
                  <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
                  <p className="mt-1 text-xs text-neutral-400">{card.hint}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">最近更新</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {recentEntries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">还没有条目，去「条目管理」新建一条。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="pl-4">
                      <Link href={`/admin/entries/${entry.id}/edit`} className="font-medium hover:underline">
                        {entry.name}
                      </Link>
                      <span className="ml-2 text-xs text-neutral-400">{entry.slug}</span>
                    </TableCell>
                    <TableCell className="text-neutral-500">{TYPE_LABELS[entry.type] ?? entry.type}</TableCell>
                    <TableCell className="text-right text-neutral-500">{formatRelative(entry.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">最近死链巡检失败</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {failures.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">还没有巡检记录，跑一次 pnpm check-links 就有了。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">条目</TableHead>
                  <TableHead>状态码</TableHead>
                  <TableHead>错误</TableHead>
                  <TableHead className="text-right">检查时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((failure) => (
                  <TableRow key={`${failure.entryId}-${String(failure.checkedAt)}`}>
                    <TableCell className="pl-4">
                      <Link href={`/admin/entries/${failure.entryId}/edit`} className="font-medium hover:underline">
                        {failure.entryName}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-neutral-500">{failure.statusCode ?? '—'}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-neutral-500">{failure.error ?? '—'}</TableCell>
                    <TableCell className="text-right text-neutral-500">{formatRelative(failure.checkedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
