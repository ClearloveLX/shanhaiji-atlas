'use client';

import { useState, useTransition } from 'react';
import { Loader2, Star, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { bulkDelete, bulkSetStatus, bulkTag } from '@/actions/entries';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import TagPicker, { EMPTY_TAG_SELECTION, type TagOption, type TagSelectionValue } from '@/components/admin/TagPicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TAG_DIMS } from '@/lib/tags';
import type { EntryStatus, TagDim } from '@/types';

/**
 * 勾选条目后从底部浮出的批量操作条。
 * 批量打标签 / 批量改状态 / 批量删除（软删除，可恢复）。
 */
export default function BulkActionBar({
  selectedIds,
  tags,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  tags: TagOption[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selection, setSelection] = useState<TagSelectionValue>(EMPTY_TAG_SELECTION);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [status, setStatus] = useState<EntryStatus>('active');
  const [pending, startTransition] = useTransition();

  const count = selectedIds.length;
  if (count === 0) return null;

  /** 把跨维度的选择拆成「每个维度一次调用」 */
  function collectTagIds(): Array<{ dim: TagDim; ids: string[] }> {
    return TAG_DIMS.map((dim) => ({
      dim,
      ids: tags.filter((tag) => tag.dim === dim && selection[dim].includes(tag.slug)).map((tag) => tag.id),
    })).filter((item) => item.ids.length > 0);
  }

  function handleBulkTag() {
    const groups = collectTagIds();
    if (groups.length === 0) {
      toast.error('先选要操作的标签');
      return;
    }

    startTransition(async () => {
      for (const group of groups) {
        const result = await bulkTag(selectedIds, group.dim, group.ids, mode);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }
      toast.success(`已给 ${count} 条${mode === 'add' ? '打上' : '移除'}标签`);
      setTagDialogOpen(false);
      setSelection(EMPTY_TAG_SELECTION);
      onDone();
    });
  }

  function handleBulkStatus() {
    startTransition(async () => {
      const result = await bulkSetStatus(selectedIds, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`已把 ${result.data.affected} 条改成新状态`);
      setStatusDialogOpen(false);
      onDone();
    });
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:pl-[236px]">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-600">
            已选 <span className="font-medium tabular-nums text-neutral-900">{count}</span> 条
          </span>

          <Button variant="outline" size="sm" onClick={() => setTagDialogOpen(true)}>
            <TagIcon className="size-4" aria-hidden />
            批量打标签
          </Button>

          <Button variant="outline" size="sm" onClick={() => setStatusDialogOpen(true)}>
            <Star className="size-4" aria-hidden />
            批量改状态
          </Button>

          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" className="text-destructive">
                <Trash2 className="size-4" aria-hidden />
                批量删除
              </Button>
            }
            title={`删除选中的 ${count} 条？`}
            description="删除是软删除，去「回收站」可以恢复。"
            confirmLabel="删除"
            onConfirm={async () => {
              const result = await bulkDelete(selectedIds);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(`已删除 ${result.data.affected} 条`);
              onDone();
            }}
          />

          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
            <X className="size-4" aria-hidden />
            取消选择
          </Button>
        </div>
      </div>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>批量打标签 · {count} 条</DialogTitle>
            <DialogDescription>选好标签后点「应用」，同一个维度的标签会一次写进所有选中条目。</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'add' ? 'default' : 'outline'}
              onClick={() => setMode('add')}
            >
              添加
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'remove' ? 'default' : 'outline'}
              onClick={() => setMode('remove')}
            >
              移除
            </Button>
          </div>

          <TagPicker tags={tags} value={selection} onChange={setSelection} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTagDialogOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={handleBulkTag} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量改状态 · {count} 条</DialogTitle>
            <DialogDescription>「疑似失效」是巡检脚本自动打的标，「已失效」一般人工确认后再选。</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {(
              [
                { value: 'active', label: '正常' },
                { value: 'stale', label: '疑似失效' },
                { value: 'dead', label: '已失效' },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="bulk-status"
                  className="size-4 accent-neutral-900"
                  checked={status === option.value}
                  onChange={() => setStatus(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusDialogOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={handleBulkStatus} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
