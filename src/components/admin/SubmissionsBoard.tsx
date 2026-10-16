'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bug, Check, CheckCheck, ExternalLink, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { approveSubmission, rejectSubmission } from '@/actions/submissions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ENTRY_REJECT_REASONS, FEEDBACK_REJECT_REASONS } from '@/lib/validation';

export type SubmissionRow = {
  id: string;
  /** entry 推荐收录 | feedback 网站建议 / BUG */
  kind: string;
  name: string;
  url: string | null;
  type: string | null;
  reason: string | null;
  contact: string | null;
  status: string;
  reviewedLabel: string | null;
  createdLabel: string;
  /** 提交超过 7 天还没处理 */
  overdue: boolean;
};

const TABS = [
  { value: 'pending', label: '待审' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
];

/** 投稿审核队列：通过时不直接建条目，而是带着内容跳到新建表单 */
export default function SubmissionsBoard({
  rows,
  status,
  counts,
}: {
  rows: SubmissionRow[];
  status: string;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [rejectTarget, setRejectTarget] = useState<SubmissionRow | null>(null);
  const [reason, setReason] = useState<string>(ENTRY_REJECT_REASONS[0]);

  function switchTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', next);
    router.replace(`/admin/submissions?${params.toString()}`);
  }

  /** 建议 / BUG 的「通过」= 已处理，不生成条目，所以不传 entryId */
  function handleResolve(row: SubmissionRow) {
    startTransition(async () => {
      const result = await approveSubmission(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`已把「${row.name}」标记为已处理`);
      router.refresh();
    });
  }

  function openReject(row: SubmissionRow) {
    setRejectTarget(row);
    setReason((row.kind === 'feedback' ? FEEDBACK_REJECT_REASONS : ENTRY_REJECT_REASONS)[0]);
  }

  function handleReject() {
    if (!rejectTarget) return;

    startTransition(async () => {
      const result = await rejectSubmission(rejectTarget.id, reason);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`已拒绝「${rejectTarget.name}」`);
      setRejectTarget(null);
      router.refresh();
    });
  }

  const rejectReasons = rejectTarget?.kind === 'feedback' ? FEEDBACK_REJECT_REASONS : ENTRY_REJECT_REASONS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            size="sm"
            variant={tab.value === status ? 'default' : 'outline'}
            onClick={() => switchTab(tab.value)}
          >
            {tab.label}
            <span className="ml-1 text-xs opacity-70">{counts[tab.value] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">名称 / 标题</TableHead>
              <TableHead>链接</TableHead>
              <TableHead className="w-[30%]">理由 / 描述</TableHead>
              <TableHead>联系方式</TableHead>
              <TableHead>{status === 'pending' ? '提交时间' : '处理时间'}</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-10 text-center text-sm text-neutral-500">
                  {status === 'pending' ? '没有待审投稿，很干净。' : '这里还是空的。'}
                </TableCell>
              </TableRow>
            ) : null}

            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="pl-4">
                  {row.kind === 'feedback' ? (
                    <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 align-middle text-[11px] text-sky-700">
                      <Bug className="size-3" aria-hidden />
                      建议 / BUG
                    </span>
                  ) : null}
                  <span className="font-medium">{row.name}</span>
                  {row.overdue ? (
                    <span className="ml-2 rounded-full bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600">
                      超过 7 天未处理
                    </span>
                  ) : null}
                </TableCell>

                <TableCell className="max-w-[220px] truncate">
                  {row.url ? (
                    <Link href={row.url} target="_blank" rel="noopener nofollow" className="text-primary hover:underline">
                      {row.url}
                    </Link>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </TableCell>

                <TableCell className="whitespace-normal text-sm text-neutral-600">{row.reason ?? '—'}</TableCell>
                <TableCell className="text-sm text-neutral-500">{row.contact ?? '—'}</TableCell>
                <TableCell className="text-sm text-neutral-500">
                  {row.overdue ? (
                    <span className="text-rose-600">{row.createdLabel}</span>
                  ) : (
                    (status === 'pending' ? row.createdLabel : (row.reviewedLabel ?? row.createdLabel))
                  )}
                </TableCell>

                <TableCell className="pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {row.url ? (
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <Link href={row.url} target="_blank" rel="noopener nofollow">
                          <ExternalLink className="size-3.5" aria-hidden />
                          看原链接
                        </Link>
                      </Button>
                    ) : null}

                    {row.status === 'pending' ? (
                      <>
                        {row.kind === 'feedback' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-emerald-700"
                            disabled={pending}
                            onClick={() => handleResolve(row)}
                          >
                            <CheckCheck className="size-3.5" aria-hidden />
                            标记已处理
                          </Button>
                        ) : (
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-700">
                            <Link href={`/admin/entries/new?fromSubmission=${row.id}`}>
                              <Check className="size-3.5" aria-hidden />
                              通过
                            </Link>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => openReject(row)}
                        >
                          <X className="size-3.5" aria-hidden />
                          拒绝
                        </Button>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => (!open ? setRejectTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>拒绝「{rejectTarget?.name}」</DialogTitle>
            <DialogDescription>
              {rejectTarget?.kind === 'feedback'
                ? '选一个原因记下来。如果是已经修好的，用左边的「标记已处理」。'
                : '选一个原因记下来，以后回头看能知道当时为什么没收。'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {rejectReasons.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="reject-reason"
                  className="size-4 accent-neutral-900"
                  checked={reason === item}
                  onChange={() => setReason(item)}
                />
                {item}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={handleReject}
              disabled={pending}
              className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90')}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
