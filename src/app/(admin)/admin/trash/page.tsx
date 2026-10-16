import type { Metadata } from 'next';
import Link from 'next/link';
import TrashActions from '@/components/admin/TrashActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminEntries } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { ENTRY_TYPE_LABELS, listSegment } from '@/lib/tags';
import { formatRelative } from '@/lib/utils';

export const metadata: Metadata = {
  title: '回收站',
  robots: { index: false, follow: false },
};

export default async function AdminTrashPage() {
  await requireAdmin();

  const paged = await getAdminEntries({ deletedOnly: true, pageSize: 200, sort: 'updated' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">回收站</h1>
        <span className="text-sm text-neutral-500">
          共 <span className="tabular-nums">{paged.total}</span> 条已删除
        </span>
      </div>

      <Card className="gap-3 rounded-lg py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">删除的条目都在这里</CardTitle>
          <CardDescription className="text-xs">
            前台已经看不到它们了。「恢复」会把条目放回原位；「彻底删除」连关联的门店、二维码一起清掉，不可撤销。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {paged.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">回收站是空的。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>slug</TableHead>
                  <TableHead>删除时间</TableHead>
                  <TableHead className="pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="pl-4 font-medium">{entry.name}</TableCell>
                    <TableCell className="text-neutral-500">{ENTRY_TYPE_LABELS[entry.type] ?? entry.type}</TableCell>
                    <TableCell className="text-neutral-400">
                      <Link
                        href={`/${listSegment(entry.type)}/${entry.slug}`}
                        target="_blank"
                        rel="noopener"
                        className="hover:underline"
                      >
                        /{listSegment(entry.type)}/{entry.slug}
                      </Link>
                    </TableCell>
                    <TableCell className="text-neutral-500">{entry.deletedAt ? formatRelative(entry.deletedAt) : '—'}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <TrashActions id={entry.id} name={entry.name} />
                    </TableCell>
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
