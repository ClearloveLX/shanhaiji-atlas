import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminBranchBoard } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { ENTRY_TYPE_LABELS } from '@/lib/tags';

export const metadata: Metadata = {
  title: '门店管理',
  robots: { index: false, follow: false },
};

/** 门店管理：按城市分组看，改地址还是要进条目的编辑页（一个品牌一条 entry） */
export default async function AdminBranchesPage() {
  await requireAdmin();

  const branches = await getAdminBranchBoard();
  const cities = Array.from(new Set(branches.map((branch) => branch.city)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">门店管理</h1>
        <span className="text-sm text-neutral-500">
          共 {branches.length} 家门店，分布在 {cities.length} 个城市
        </span>
      </div>

      {cities.length === 0 ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">还没有门店</CardTitle>
            <CardDescription className="text-xs">
              门店属于「线下好店」形态的条目：在 /admin/entries/new 选「线下好店」，填地址后自动定位。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {cities.map((city) => {
        const rows = branches.filter((branch) => branch.city === city);

        return (
          <Card key={city} className="gap-3 rounded-lg py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">
                {city}
                <span className="ml-2 font-normal text-neutral-500">{rows.length} 家</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">品牌 / 门店</TableHead>
                    <TableHead>地址</TableHead>
                    <TableHead>电话</TableHead>
                    <TableHead>营业时间</TableHead>
                    <TableHead>坐标</TableHead>
                    <TableHead className="pr-4 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((branch) => (
                    <TableRow key={branch.id}>
                      <TableCell className="pl-4">
                        <Link href={`/admin/entries/${branch.entryId}/edit`} className="font-medium hover:underline">
                          {branch.entryName}
                        </Link>
                        <span className="ml-2 text-xs text-neutral-400">
                          {branch.name ?? '单店'} · {ENTRY_TYPE_LABELS[branch.entryType] ?? branch.entryType}
                          {branch.isPrimary ? ' · 主店' : ''}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-neutral-600">{branch.address}</TableCell>
                      <TableCell className="text-neutral-500">{branch.phone ?? '—'}</TableCell>
                      <TableCell className="text-neutral-500">{branch.hours ?? '—'}</TableCell>
                      <TableCell className="text-xs text-neutral-500">
                        {branch.lat != null && branch.lng != null
                          ? `${branch.lng.toFixed(5)}, ${branch.lat.toFixed(5)}`
                          : '未定位'}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Link href={`/admin/entries/${branch.entryId}/edit`} className="text-xs text-primary hover:underline">
                          编辑
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
