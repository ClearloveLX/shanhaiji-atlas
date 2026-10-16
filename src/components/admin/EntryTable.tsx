'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, GripVertical, Pencil, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { moveEntry, reorderEntry, softDeleteEntry } from '@/actions/entries';
import BulkActionBar from '@/components/admin/BulkActionBar';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import { FeaturedToggle, StatusToggle } from '@/components/admin/StatusToggle';
import type { TagOption } from '@/components/admin/TagPicker';
import { Button } from '@/components/ui/button';
import { ENTRY_TYPE_LABELS, LINK_MODE_LABELS, listSegment } from '@/lib/tags';
import { cn, colorFromName, initialOf } from '@/lib/utils';

export type AdminEntryRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  linkMode: string;
  status: string;
  visibility: string;
  featured: boolean;
  icon: string | null;
  url: string | null;
  /** 外链被点开的累计次数（走 /go/{slug} 才计数） */
  clickCount: number;
  /** 详情页被打开的累计次数 */
  viewCount: number;
  updatedLabel: string;
  tags: Array<{ id: string; name: string; color: string; dim: string }>;
};

/** 列表页的排序键 → 列 key 的映射（URL 里用 sort/dir 两个参数） */
const SORTABLE: Record<string, string> = {
  name: 'name',
  type: 'type',
  status: 'status',
  updated: 'updated',
  featured: 'featured',
};

export default function EntryTable({
  rows,
  total,
  page,
  totalPages,
  pageSize,
  sort,
  dir,
  positions,
  tags,
}: {
  rows: AdminEntryRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
  /** 手动排序视图专用：id → 在自己类型里的第几位 / 该类型总数 */
  positions?: Record<string, { position: number; total: number }>;
  tags: TagOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  /** 正在被拖走的那一行 */
  const [dragging, setDragging] = useState<AdminEntryRow | null>(null);
  /**
   * 拖拽源同时存一份 ref：dragstart 之后紧跟的 dragover 是同一个事件循环里的，
   * 这时 setState 还没生效 —— 只看 state 的话第一下 dragover 会被当成「没有拖拽源」而忽略。
   */
  const dragSourceRef = useRef<AdminEntryRow | null>(null);
  /** 当前悬停的落点：插在这一行的前面还是后面 */
  const [dropAt, setDropAt] = useState<{ id: string; place: 'before' | 'after' } | null>(null);
  /** 正在用键盘微调的那一行 */
  const [nudging, setNudging] = useState<string | null>(null);

  const buildHref = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      return `/admin/entries${query ? `?${query}` : ''}`;
    },
    [searchParams],
  );

  function handleSort(key: string) {
    const nextDir = sort === key && dir === 'desc' ? 'asc' : 'desc';
    router.push(buildHref({ sort: key, dir: nextDir, page: undefined }));
  }

  /** 键盘微调：焦点在序号上时按 ↑↓，走的是和拖动同一个 action 体系（moveEntry） */
  const handleNudge = useCallback(
    async (row: AdminEntryRow, direction: 'up' | 'down') => {
      setNudging(row.id);
      const result = await moveEntry(row.id, direction);
      setNudging(null);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const label = ENTRY_TYPE_LABELS[row.type] ?? row.type;
      const verb = direction === 'up' ? '上移' : '下移';
      toast.success(`「${result.data.name}」已${verb}到${label}第 ${result.data.position} 位（共 ${result.data.total} 条）`);
      router.refresh();
    },
    [router],
  );

  /** 拖动落位：告诉服务端「放到谁的哪一边」，剩下的顺序由服务端按权威顺序重算 */
  const handleDrop = useCallback(
    async (source: AdminEntryRow, target: AdminEntryRow, place: 'before' | 'after') => {
      if (source.id === target.id || source.type !== target.type) return;

      const result = await reorderEntry(source.id, target.id, place);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (!result.data.changed) return;

      const label = ENTRY_TYPE_LABELS[target.type] ?? target.type;
      toast.success(`「${result.data.name}」已移到${label}第 ${result.data.position} 位（共 ${result.data.total} 条）`);
      router.refresh();
    },
    [router],
  );

  /** 当前页里的行号：非手动排序时，序号列显示它 */
  const indexOf = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows]);

  const columns = useMemo<DataTableColumn<AdminEntryRow>[]>(
    () => [
      {
        key: 'index',
        header: (
          <span title="手动排序时显示「在自己那一类里排第几位」（前台就是这个位置）；按其它方式排序时，就是当前列表的行号">
            序号
          </span>
        ),
        align: 'right',
        className: 'w-[68px]',
        render: (row) => {
          const at = positions?.[row.id];

          // 手动排序：第几位 = 前台列表里的位置，一眼能对上
          if (sort === 'manual' && at) {
            const label = ENTRY_TYPE_LABELS[row.type] ?? row.type;
            return (
              <span className="flex items-center justify-end gap-1">
                <GripVertical className="size-3.5 shrink-0 text-neutral-300" aria-hidden />
                <span
                  role="spinbutton"
                  tabIndex={0}
                  aria-label={`${label}里的第 ${at.position} 位，共 ${at.total} 条。按方向键上 / 下微调顺序，或者直接拖动这一行`}
                  title={`${label}里的第 ${at.position} 位（共 ${at.total} 条）· 按 ↑↓ 微调`}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    if (nudging) return;
                    void handleNudge(row, event.key === 'ArrowUp' ? 'up' : 'down');
                  }}
                  className={cn(
                    'num rounded text-sm text-neutral-500 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                    nudging === row.id && 'opacity-40',
                  )}
                >
                  {at.position}
                </span>
              </span>
            );
          }

          if (sort === 'manual' && !at) {
            return (
              <span className="num text-sm text-neutral-300" title="不列出 / 私密的条目不进前台列表，没有名次">
                —
              </span>
            );
          }

          const index = indexOf.get(row.id);
          return (
            <span className="num text-sm text-neutral-400" title="当前列表的行号">
              {index === undefined ? '—' : (page - 1) * pageSize + index + 1}
            </span>
          );
        },
      },
      {
        key: 'name',
        header: '名称',
        sortable: true,
        render: (row) => (
          <div className="flex items-center gap-3">
            {row.icon ? (
              <Image
                src={row.icon}
                alt=""
                width={32}
                height={32}
                draggable={false}
                className="size-8 shrink-0 rounded-md border border-neutral-200 object-cover"
                unoptimized
              />
            ) : (
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-medium text-white"
                style={{ backgroundColor: colorFromName(row.name) }}
              >
                {initialOf(row.name)}
              </span>
            )}
            <span className="min-w-0">
              <Link href={`/admin/entries/${row.id}/edit`} className="block truncate font-medium hover:underline">
                {row.name}
              </Link>
              <span className="block truncate text-xs text-neutral-400">
                {row.slug} · {LINK_MODE_LABELS[row.linkMode] ?? row.linkMode}
              </span>
            </span>
          </div>
        ),
      },
      {
        key: 'type',
        header: '类型',
        render: (row) => <span className="text-neutral-600">{ENTRY_TYPE_LABELS[row.type] ?? row.type}</span>,
      },
      {
        key: 'tags',
        header: '标签',
        render: (row) => (
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {row.tags.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border px-1.5 py-0.5 text-[11px]"
                style={{ borderColor: `${tag.color}55`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {row.tags.length > 4 ? <span className="text-[11px] text-neutral-400">+{row.tags.length - 4}</span> : null}
            {row.tags.length === 0 ? <span className="text-[11px] text-neutral-400">未打标签</span> : null}
          </div>
        ),
      },
      {
        key: 'status',
        header: '状态',
        render: (row) => <StatusToggle id={row.id} status={row.status} />,
      },
      {
        key: 'visibility',
        header: '可见性',
        render: (row) =>
          row.visibility === 'public' ? (
            <span className="text-xs text-neutral-400">公开</span>
          ) : (
            <span
              className={
                row.visibility === 'private'
                  ? 'rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] text-white'
                  : 'rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500'
              }
            >
              {row.visibility === 'private' ? '私密' : '不列出'}
            </span>
          ),
      },
      {
        key: 'featured',
        header: '精选',
        sortable: true,
        align: 'center',
        render: (row) => <FeaturedToggle id={row.id} featured={row.featured} name={row.name} />,
      },
      {
        key: 'clicks',
        header: '点击',
        align: 'right',
        className: 'w-[72px]',
        render: (row) => (
          <span
            className="flex flex-col items-end leading-tight"
            title={`外链被点开 ${row.clickCount} 次 · 详情页被打开 ${row.viewCount} 次（只做参考，不影响顺序）`}
          >
            <span className={cn('num text-sm', row.clickCount > 0 ? 'text-neutral-800' : 'text-neutral-300')}>
              {row.clickCount}
            </span>
            <span className="num text-[11px] text-neutral-400">浏览 {row.viewCount}</span>
          </span>
        ),
      },
      {
        key: 'updated',
        header: '更新时间',
        sortable: true,
        render: (row) => <span className="text-neutral-500">{row.updatedLabel}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        align: 'right',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs has-[>svg]:px-2">
              <Link href={`/admin/entries/${row.id}/edit`}>
                <Pencil className="size-3.5" aria-hidden />
                编辑
              </Link>
            </Button>

            <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs has-[>svg]:px-2">
              <Link href={`/${listSegment(row.type)}/${row.slug}`} target="_blank" rel="noopener">
                <ExternalLink className="size-3.5" aria-hidden />
                前台
              </Link>
            </Button>

            {row.linkMode === 'internal' ? (
              <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs has-[>svg]:px-2">
                <Link href={`/tools/${row.slug}/app`} target="_blank" rel="noopener">
                  <Wrench className="size-3.5" aria-hidden />
                  打开工具
                </Link>
              </Button>
            ) : null}

            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs has-[>svg]:px-2 text-destructive">
                  <Trash2 className="size-3.5" aria-hidden />
                  删除
                </Button>
              }
              title={`删除「${row.name}」？`}
              description="软删除，条目会进回收站，前台立刻消失，之后可以恢复。"
              confirmLabel="删除"
              requireText={row.name}
              onConfirm={async () => {
                const result = await softDeleteEntry(row.id);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`已删除「${row.name}」`);
                router.refresh();
              }}
            />
          </div>
        ),
      },
    ],
    [handleNudge, indexOf, nudging, page, pageSize, positions, router, sort],
  );

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={cn(selected.length > 0 && 'pb-20')}>
      {sort === 'manual' ? (
        <p className="mb-2 text-xs text-neutral-500">
          按住任意一行上下拖动就能调顺序，只能在同一类（工具 / 站点 / 店铺）里拖 ——
          它对应的是前台 /tools、/sites、/shops 三个列表各自的顺序，松手立刻生效。
          键盘选中左侧序号后按 ↑↓ 也能微调。点击 / 浏览只是给你看的参考，不会自动影响顺序。
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        sort={{ key: sort === 'manual' ? '' : sort in SORTABLE ? sort : 'updated', dir }}
        onSortChange={handleSort}
        onSortClear={() => router.push(buildHref({ sort: 'manual', dir: undefined, page: undefined }))}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        emptyMessage="没有符合条件的条目，换个筛选条件试试。"
        rowProps={(row) =>
          sort === 'manual'
            ? {
                draggable: true,
                onDragStart: (event) => {
                  dragSourceRef.current = row;
                  setDragging(row);
                  event.dataTransfer.effectAllowed = 'move';
                  // Firefox 必须写点东西，否则拖不动
                  event.dataTransfer.setData('text/plain', row.id);
                },
                onDragOver: (event) => {
                  // 只接受同一类里的行：跨类型拖是没意义的（前台各排各的）
                  const source = dragSourceRef.current;
                  if (!source || source.id === row.id || source.type !== row.type) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const rect = event.currentTarget.getBoundingClientRect();
                  const place = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
                  setDropAt((prev) => (prev?.id === row.id && prev.place === place ? prev : { id: row.id, place }));
                },
                onDrop: (event) => {
                  event.preventDefault();
                  const source = dragSourceRef.current;
                  dragSourceRef.current = null;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const place = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
                  setDragging(null);
                  setDropAt(null);
                  if (source) void handleDrop(source, row, place);
                },
                onDragEnd: () => {
                  dragSourceRef.current = null;
                  setDragging(null);
                  setDropAt(null);
                },
              }
            : {}
        }
        rowClassName={(row) =>
          cn(
            sort === 'manual' && 'cursor-grab active:cursor-grabbing',
            dragging?.id === row.id && 'opacity-40',
            dropAt?.id === row.id &&
              (dropAt.place === 'before'
                ? '[box-shadow:inset_0_2px_0_var(--brand)]'
                : '[box-shadow:inset_0_-2px_0_var(--brand)]'),
          ) || undefined
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-neutral-500">
              共 <span className="tabular-nums">{total}</span> 条{total > 0 ? `，当前显示第 ${from}-${to} 条` : ''}
            </span>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                <Link href={buildHref({ page: page <= 2 ? undefined : String(page - 1) })}>上一页</Link>
              </Button>
              <span className="tabular-nums text-neutral-500">
                {page} / {totalPages}
              </span>
              <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
                <Link href={buildHref({ page: String(page + 1) })}>下一页</Link>
              </Button>
            </div>
          </div>
        }
      />

      <BulkActionBar
        selectedIds={selected}
        tags={tags}
        onClear={() => setSelected([])}
        onDone={() => {
          setSelected([]);
          router.refresh();
        }}
      />
    </div>
  );
}
