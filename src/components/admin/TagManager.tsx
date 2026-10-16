'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Combine, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createTag, deleteTag, mergeTags, updateTag } from '@/actions/tags';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TAG_DIMS, TAG_DIM_LABELS, pickTagColor, slugifyTagName } from '@/lib/tags';
import { cn } from '@/lib/utils';

export type AdminTagRow = {
  id: string;
  dim: string;
  slug: string;
  name: string;
  color: string;
  icon: string | null;
  desc: string | null;
  sort: number;
  count: number;
};

export type TagEntryPreview = {
  tagId: string;
  entries: Array<{ id: string; name: string; type: string }>;
};

const DIM_ORDER = [...TAG_DIMS, 'private'];

/** 标签管理：按维度分 Tab，行内改完失焦即保存，支持合并与「带引用删除」 */
export default function TagManager({
  tags,
  entryPreviews,
}: {
  tags: AdminTagRow[];
  entryPreviews: Record<string, Array<{ id: string; name: string; type: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dim, setDim] = useState<string>('scene');
  const [rows, setRows] = useState<AdminTagRow[]>(tags);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminTagRow | null>(null);
  const [deleteMode, setDeleteMode] = useState<'detach' | 'move'>('detach');
  const [moveTarget, setMoveTarget] = useState('');
  const [draft, setDraft] = useState({ name: '', slug: '', color: pickTagColor('新标签'), desc: '', icon: '', sort: 999 });

  const dims = useMemo(() => DIM_ORDER.filter((item) => rows.some((row) => row.dim === item)), [rows]);
  const current = rows.filter((row) => row.dim === dim);
  const sameDim = rows.filter((row) => row.dim === dim);

  function patch(id: string, changes: Partial<AdminTagRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function save(row: AdminTagRow) {
    startTransition(async () => {
      const result = await updateTag(row.id, {
        dim: row.dim,
        slug: row.slug,
        name: row.name,
        color: row.color,
        icon: row.icon ?? undefined,
        desc: row.desc ?? undefined,
        sort: row.sort,
      });

      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(`已保存「${row.name}」`);
      router.refresh();
    });
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createTag({
        dim,
        slug: draft.slug || slugifyTagName(draft.name),
        name: draft.name,
        color: draft.color,
        icon: draft.icon || undefined,
        desc: draft.desc || undefined,
        sort: draft.sort,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`已新建标签「${draft.name}」`);
      setCreateOpen(false);
      setDraft({ name: '', slug: '', color: pickTagColor('新标签'), desc: '', icon: '', sort: 999 });
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteTag(deleteTarget.id, deleteMode, deleteMode === 'move' ? moveTarget : undefined);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`已删除「${deleteTarget.name}」`);
      setDeleteTarget(null);
      setSelected((prev) => prev.filter((id) => id !== deleteTarget.id));
      router.refresh();
    });
  }

  function handleMerge() {
    startTransition(async () => {
      const result = await mergeTags(selected, mergeTarget);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`已合并 ${selected.length} 个标签，搬走 ${result.data.moved} 条引用`);
      setMergeOpen(false);
      setSelected([]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {dims.map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={item === dim ? 'default' : 'outline'}
            onClick={() => {
              setDim(item);
              setSelected([]);
              setExpanded(null);
            }}
          >
            {TAG_DIM_LABELS[item] ?? item}
            <span className="ml-1 text-xs opacity-70">{rows.filter((row) => row.dim === item).length}</span>
          </Button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={selected.length < 2} onClick={() => {
            setMergeTarget(sameDim.find((row) => !selected.includes(row.id))?.id ?? '');
            setMergeOpen(true);
          }}>
            <Combine className="size-4" aria-hidden />
            合并选中（{selected.length}）
          </Button>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            新建标签
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 pl-4" />
              <TableHead className="w-10">选</TableHead>
              <TableHead className="w-12">颜色</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>slug</TableHead>
              <TableHead className="w-[28%]">描述（标签页正文）</TableHead>
              <TableHead className="text-right">条目数</TableHead>
              <TableHead className="w-20 text-right">排序</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {current.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="py-8 text-center text-sm text-neutral-500">
                  这个维度还没有标签。
                </TableCell>
              </TableRow>
            ) : null}

            {current.map((row) => {
              const previews = entryPreviews[row.id] ?? [];
              const isOpen = expanded === row.id;

              return (
                <Fragment key={row.id}>
                  <TableRow>
                    <TableCell className="pl-4">
                      <button
                        type="button"
                        aria-label={isOpen ? '收起条目列表' : '展开条目列表'}
                        onClick={() => setExpanded(isOpen ? null : row.id)}
                        className="text-neutral-400 transition-colors hover:text-neutral-700"
                      >
                        {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                      </button>
                    </TableCell>

                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-neutral-900"
                        checked={selected.includes(row.id)}
                        onChange={(event) =>
                          setSelected((prev) => (event.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)))
                        }
                        aria-label={`选择标签 ${row.name}`}
                      />
                    </TableCell>

                    <TableCell>
                      <input
                        type="color"
                        value={row.color}
                        onChange={(event) => patch(row.id, { color: event.target.value })}
                        onBlur={() => save(rows.find((item) => item.id === row.id) ?? row)}
                        aria-label={`${row.name} 的颜色`}
                        className="h-7 w-9 cursor-pointer rounded border border-neutral-200 bg-white p-0.5"
                      />
                    </TableCell>

                    <TableCell>
                      <input
                        autoComplete="off"
                        spellCheck={false}
                        value={row.name}
                        onChange={(event) => patch(row.id, { name: event.target.value })}
                        onBlur={() => save(rows.find((item) => item.id === row.id) ?? row)}
                        className="h-7 w-28 rounded border border-transparent px-1.5 text-sm hover:border-neutral-200 focus:border-neutral-400 focus:outline-none"
                      />
                    </TableCell>

                    <TableCell>
                      <input
                        autoComplete="off"
                        spellCheck={false}
                        value={row.slug}
                        onChange={(event) => patch(row.id, { slug: event.target.value })}
                        onBlur={() => save(rows.find((item) => item.id === row.id) ?? row)}
                        className="h-7 w-32 rounded border border-transparent px-1.5 font-mono text-xs hover:border-neutral-200 focus:border-neutral-400 focus:outline-none"
                      />
                    </TableCell>

                    <TableCell>
                      <textarea
                        autoComplete="off"
                        spellCheck={false}
                        value={row.desc ?? ''}
                        rows={2}
                        onChange={(event) => patch(row.id, { desc: event.target.value })}
                        onBlur={() => save(rows.find((item) => item.id === row.id) ?? row)}
                        className="w-full resize-none rounded border border-transparent px-1.5 py-1 text-xs leading-relaxed hover:border-neutral-200 focus:border-neutral-400 focus:outline-none"
                        placeholder="30-60 字，会渲染到标签聚合页顶部"
                      />
                    </TableCell>

                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>

                    <TableCell className="text-right">
                      <input
                        autoComplete="off"
                        spellCheck={false}
                        type="number"
                        value={row.sort}
                        onChange={(event) => patch(row.id, { sort: Number(event.target.value) || 0 })}
                        onBlur={() => save(rows.find((item) => item.id === row.id) ?? row)}
                        className="h-7 w-16 rounded border border-transparent px-1.5 text-right text-sm hover:border-neutral-200 focus:border-neutral-400 focus:outline-none"
                      />
                    </TableCell>

                    <TableCell className="pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={pending}
                          onClick={() => save(row)}
                        >
                          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
                          保存
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => {
                            setDeleteTarget(row);
                            setDeleteMode(row.count > 0 ? 'move' : 'detach');
                            setMoveTarget(sameDim.find((item) => item.id !== row.id)?.id ?? '');
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {isOpen ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={9} className="bg-neutral-50 px-4 py-3">
                        {previews.length === 0 ? (
                          <p className="text-xs text-neutral-500">这个标签下还没有条目。</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {previews.map((entry) => (
                              <Link
                                key={entry.id}
                                href={`/admin/entries/${entry.id}/edit`}
                                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs transition-colors hover:bg-neutral-100"
                              >
                                {entry.name}
                              </Link>
                            ))}
                            {row.count > previews.length ? (
                              <span className="self-center text-xs text-neutral-400">
                                还有 {row.count - previews.length} 条，去条目列表按这个标签筛
                              </span>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 新建标签 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建标签 · {TAG_DIM_LABELS[dim] ?? dim}</DialogTitle>
            <DialogDescription>标签先注册再使用。slug 用英文小写，改 slug 会让标签页断链。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tag-name">名称</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id="new-tag-name"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如「免登录」"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tag-slug">slug</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id="new-tag-slug"
                value={draft.slug}
                onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder={draft.name ? slugifyTagName(draft.name) : 'no-login'}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tag-color">颜色</Label>
              <div className="flex items-center gap-2">
                <input
                  id="new-tag-color"
                  type="color"
                  value={draft.color}
                  onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
                  className="h-8 w-12 cursor-pointer rounded border border-neutral-200 bg-white p-0.5"
                />
                <span className="font-mono text-xs text-neutral-500">{draft.color}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tag-desc">描述（30-60 字）</Label>
              <textarea
                autoComplete="off"
                spellCheck={false}
                id="new-tag-desc"
                value={draft.desc}
                rows={3}
                onChange={(event) => setDraft((prev) => ({ ...prev, desc: event.target.value }))}
                className="w-full resize-none rounded-md border border-input px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleCreate} disabled={pending || !draft.name.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 合并标签 */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>合并 {selected.length} 个标签</DialogTitle>
            <DialogDescription>
              所有引用会改到保留的那个标签上，其余标签被删除。整个过程在一个事务里，不会出现半合并状态。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="merge-target">保留哪一个</Label>
            <select
              id="merge-target"
              value={mergeTarget}
              onChange={(event) => setMergeTarget(event.target.value)}
              className="h-9 rounded-md border border-input px-2 text-sm outline-none focus-visible:border-ring"
            >
              <option value="">请选择</option>
              {current.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}（{row.count} 条）{selected.includes(row.id) ? ' · 待合并' : ''}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleMerge} disabled={pending || !mergeTarget}>
              合并
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除标签：带引用时要求二选一 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除标签「{deleteTarget?.name}」</DialogTitle>
            <DialogDescription>
              {deleteTarget && deleteTarget.count > 0
                ? `该标签被 ${deleteTarget.count} 条条目使用，直接删会把这些条目上的这个标签一起抹掉。`
                : '这个标签还没有条目在用。'}
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && deleteTarget.count > 0 ? (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="delete-mode"
                  className="size-4 accent-neutral-900"
                  checked={deleteMode === 'move'}
                  onChange={() => setDeleteMode('move')}
                />
                批量改到另一个标签
              </label>
              {deleteMode === 'move' ? (
                <select
                  value={moveTarget}
                  onChange={(event) => setMoveTarget(event.target.value)}
                  className="h-9 rounded-md border border-input px-2 text-sm outline-none focus-visible:border-ring"
                  aria-label="目标标签"
                >
                  <option value="">请选择目标标签</option>
                  {sameDim
                    .filter((row) => row.id !== deleteTarget.id)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}（{row.count} 条）
                      </option>
                    ))}
                </select>
              ) : null}

              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="delete-mode"
                  className="size-4 accent-neutral-900"
                  checked={deleteMode === 'detach'}
                  onChange={() => setDeleteMode('detach')}
                />
                仅从所有条目上移除这个标签
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              type="button"
              className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90')}
              onClick={handleDelete}
              disabled={pending}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
