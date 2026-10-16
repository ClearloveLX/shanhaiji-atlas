'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { purgeEntry, restoreEntry } from '@/actions/entries';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Button } from '@/components/ui/button';

/** 回收站的一行操作：恢复 / 彻底删除（要输入条目名确认） */
export default function TrashActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await restoreEntry(id);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(`已恢复「${name}」`);
            router.refresh();
          });
        }}
      >
        <RotateCcw className="size-3.5" aria-hidden />
        恢复
      </Button>

      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive">
            <Trash2 className="size-3.5" aria-hidden />
            彻底删除
          </Button>
        }
        title={`彻底删除「${name}」？`}
        description="删掉之后连回收站里也没有了，关联的门店、二维码、标签关系会一起清掉，无法撤销。"
        confirmLabel="彻底删除"
        requireText={name}
        onConfirm={async () => {
          const result = await purgeEntry(id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success('已彻底删除');
          router.refresh();
        }}
      />
    </div>
  );
}
