import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminClickStats, getAdminZeroClickEntries } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: '点击统计',
  robots: { index: false, follow: false },
};

const TYPE_LABELS: Record<string, string> = {
  tool: '工具',
  site: '站点',
  shop: '店铺',
};

const RANGE_OPTIONS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
] as const;

/** 迷你柱状图：近 14 天每天一根柱子，不装图表库 */
function TrendBars({ trend }: { trend: number[] }) {
  const max = Math.max(...trend, 1);

  return (
    <div className="flex h-8 items-end gap-[2px]" aria-hidden>
      {trend.map((value, index) => (
        <span
          key={index}
          className={cn('w-1.5 rounded-sm', value > 0 ? 'bg-primary/70' : 'bg-neutral-200')}
          style={{ height: `${Math.max(8, Math.round((value / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

export default async function AdminClicksPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; sort?: string }>;
}) {
  await requireAdmin();

  const { range: rangeParam, sort: sortParam } = await searchParams;
  const range = RANGE_OPTIONS.some((option) => option.value === rangeParam) ? rangeParam : '30';
  const sort = sortParam === 'recent' ? 'recent' : 'total';

  const [stats, zeroClick] = await Promise.all([getAdminClickStats(200), getAdminZeroClickEntries(30, 24)]);

  const rangeKey = range === '7' ? 'last7' : range === '90' ? 'last30' : 'last30';
  const rows = stats
    .filter((row) => (range === '7' ? row.last7 > 0 : row.last30 > 0))
    .sort((a, b) => (sort === 'recent' ? b[rangeKey] - a[rangeKey] : b.total - a.total))
    .slice(0, 60);

  const totalClicks = stats.reduce((sum, row) => sum + row.total, 0);
  const todayClicks = stats.reduce((sum, row) => sum + row.today, 0);
  const last30Clicks = stats.reduce((sum, row) => sum + row.last30, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">点击统计</h1>
        <div className="flex items-center gap-2 text-sm">
          {RANGE_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/clicks?range=${option.value}&sort=${sort}`}
              className={cn(
                'rounded-md border px-2.5 py-1 transition-colors',
                option.value === range ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:bg-neutral-100',
              )}
            >
              {option.label}
            </Link>
          ))}
          <Link
            href={`/admin/clicks?range=${range}&sort=${sort === 'total' ? 'recent' : 'total'}`}
            className="rounded-md border border-neutral-300 px-2.5 py-1 transition-colors hover:bg-neutral-100"
          >
            按{sort === 'total' ? '区间点击' : '总点击'}排序
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: '今日点击', value: todayClicks },
          { label: '近 30 天点击', value: last30Clicks },
          { label: '历史总点击', value: totalClicks },
        ].map((card) => (
          <Card key={card.label} className="gap-1 rounded-lg py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-normal text-neutral-500">{card.label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">条目点击排行</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">这个区间里还没有点击记录。前台点一次外链就会出现。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">条目</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">今日</TableHead>
                  <TableHead className="text-right">近 7 天</TableHead>
                  <TableHead className="text-right">近 30 天</TableHead>
                  <TableHead className="text-right">总点击</TableHead>
                  <TableHead className="pl-4">近 14 天趋势</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4">
                      <Link href={`/admin/entries/${row.id}/edit`} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-neutral-500">{TYPE_LABELS[row.type] ?? row.type}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.today}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.last7}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.last30}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.total}</TableCell>
                    <TableCell className="pl-4">
                      <TrendBars trend={row.trend} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">近 30 天一次都没人点</CardTitle>
          <CardDescription className="text-xs">
            这些条目可能已经没人用了 —— 是清理收录的依据，不自动处理。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {zeroClick.length === 0 ? (
            <p className="text-sm text-neutral-500">没有这样的条目，很好。</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {zeroClick.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/admin/entries/${row.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1 text-xs transition-colors hover:bg-neutral-100"
                  >
                    {row.name}
                    <span className="text-neutral-400">{TYPE_LABELS[row.type] ?? row.type}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
