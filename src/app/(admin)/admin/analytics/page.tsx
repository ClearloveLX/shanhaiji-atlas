import type { Metadata } from 'next';
import Link from 'next/link';
import { Eye, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminTrafficStats } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: '访问统计',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = { tool: '工具', site: '站点', shop: '店铺' };

const KIND_LABELS: Record<string, string> = {
  home: '首页',
  list: '列表页',
  detail: '详情页',
  tag: '标签页',
  search: '搜索页',
  tool: '工具运行页',
  other: '其它',
};

const RANGE_OPTIONS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
] as const;

/** 一行一天：访客用深色、浏览用浅色，纯 CSS，不装图表库 */
function TrendChart({ trend }: { trend: Array<{ day: string; visitors: number; views: number }> }) {
  const max = Math.max(...trend.map((item) => Math.max(item.visitors, item.views)), 1);

  return (
    <div className="flex items-end gap-1.5">
      {trend.map((item) => (
        <div key={item.day} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-24 w-full items-end justify-center gap-0.5" title={`${item.day} · 访客 ${item.visitors} · 浏览 ${item.views}`}>
            <span
              className={cn('w-2 rounded-sm', item.visitors > 0 ? 'bg-primary' : 'bg-neutral-200')}
              style={{ height: `${Math.max(4, Math.round((item.visitors / max) * 100))}%` }}
            />
            <span
              className={cn('w-2 rounded-sm', item.views > 0 ? 'bg-primary/30' : 'bg-neutral-200')}
              style={{ height: `${Math.max(4, Math.round((item.views / max) * 100))}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-neutral-400">{item.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: number; hint?: string; icon: typeof Eye }) {
  return (
    <Card className="gap-1 rounded-lg py-4">
      <CardHeader className="flex-row items-center justify-between px-4">
        <CardTitle className="text-sm font-normal text-neutral-500">{label}</CardTitle>
        <Icon className="size-4 text-neutral-300" aria-hidden />
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-neutral-400">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdmin();

  const { range: rangeParam } = await searchParams;
  const range = RANGE_OPTIONS.some((option) => option.value === rangeParam) ? rangeParam : '7';
  const stats = await getAdminTrafficStats(Number(range));

  const hasData = stats.totalViews > 0;
  const perVisitor = stats.today.visitors > 0 ? (stats.today.views / stats.today.visitors).toFixed(1) : '—';
  const diffFromYesterday = stats.today.visitors - stats.yesterday.visitors;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">访问统计</h1>
          <p className="mt-1 text-xs text-neutral-500">
            服务端记录，不写 cookie、不存 IP；预取、爬虫和站长自己的访问都不计入。
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {RANGE_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/analytics?range=${option.value}`}
              className={cn(
                'rounded-md border px-2.5 py-1 transition-colors',
                option.value === range
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-300 hover:bg-neutral-100',
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="今日访客"
          value={stats.today.visitors}
          hint={
            stats.yesterday.visitors > 0
              ? `昨天 ${stats.yesterday.visitors}，${diffFromYesterday >= 0 ? '多' : '少'} ${Math.abs(diffFromYesterday)}`
              : '昨天没有记录'
          }
          icon={Users}
        />
        <StatCard label="今日浏览" value={stats.today.views} hint={`人均 ${perVisitor} 页`} icon={Eye} />
        <StatCard label={`近 ${range} 天访客`} value={Number(range) === 30 ? stats.visitorsLast30 : stats.visitorsLast7} hint="按天去重后相加" icon={Users} />
        <StatCard label={`近 ${range} 天浏览`} value={Number(range) === 30 ? stats.viewsLast30 : stats.viewsLast7} hint={`历史累计 ${stats.totalViews}`} icon={Eye} />
      </div>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">近 14 天</CardTitle>
          <CardDescription className="text-xs">
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-sm bg-primary" />
              访客
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-sm bg-primary/30" />
              浏览
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {hasData ? (
            <TrendChart trend={stats.trend} />
          ) : (
            <p className="py-6 text-sm text-neutral-500">
              还没有数据。用无痕窗口打开一次前台页面，这里就会出现今天的记录 —— 站长登录状态下不计入。
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 rounded-lg py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">热门页面 · 近 {range} 天</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {stats.topPages.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500">这个区间里还没有浏览记录。</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">页面</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead className="text-right">浏览</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topPages.map((row) => (
                    <TableRow key={row.path}>
                      <TableCell className="pl-4">
                        <Link href={row.path} target="_blank" rel="noopener" className="font-mono text-xs hover:underline">
                          {row.path}
                        </Link>
                      </TableCell>
                      <TableCell className="text-neutral-500">{KIND_LABELS[row.kind] ?? row.kind}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.views}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 rounded-lg py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">热门条目 · 近 {range} 天</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {stats.topEntries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500">这个区间里还没有人打开过详情页。</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">条目</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead className="text-right">浏览</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topEntries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="pl-4">
                        <Link href={`/admin/entries/${row.id}/edit`} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-neutral-500">{TYPE_LABELS[row.type] ?? row.type}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.views}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">来源 · 近 {range} 天</CardTitle>
          <CardDescription className="text-xs">只记域名，不记完整 URL；站内跳转和直接访问不计。</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {stats.topRefs.length === 0 ? (
            <p className="text-sm text-neutral-500">还没有站外来源。等搜索引擎或别人分享的链接带人过来就会出现在这。</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {stats.topRefs.map((row) => (
                <li
                  key={row.host}
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-2.5 py-1 text-xs"
                >
                  <span className="font-mono">{row.host}</span>
                  <span className="tabular-nums text-neutral-400">{row.views}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">怎么算的</CardTitle>
        </CardHeader>
        <CardContent className="px-4 text-xs leading-relaxed text-neutral-500">
          <ul className="flex flex-col gap-1.5">
            <li>· <strong className="font-medium text-neutral-700">访客</strong>：一个当天有效、隔天就变的摘要去重，同一天同一台设备算 1 人；原始 IP 和浏览器标识不入库。</li>
            <li>· <strong className="font-medium text-neutral-700">近 7 / 30 天访客</strong>是「每天去重后相加」，同一个人连来 3 天会算 3 次 —— 跨天合并身份是故意做不到的。</li>
            <li>· 预取（鼠标划过链接时浏览器提前拉页面）、爬虫、<code className="font-mono">/admin</code> 与 <code className="font-mono">/me</code>、以及站长自己登录后的访问都不计入。</li>
            <li>· 搜索词不记录，只记搜索页被用过；外链点击看「点击统计」那一页。</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
