'use client';

import { useState, type ReactNode } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * 危险操作的二次确认。
 * 用法：把触发按钮放在 trigger 里，确认后执行 onConfirm。
 * requireText 不为空时，用户必须原样输入这段文字才能点确认（例如彻底删除要输入条目名）。
 */
export default function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  requireText,
  destructive = true,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  requireText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);

  const blocked = Boolean(requireText) && typed.trim() !== requireText;

  async function handleConfirm() {
    if (blocked) return;
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
      setTyped('');
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {/*
            description 是字符串时**不能**给 AlertDialogDescription 加 asChild：
            Radix 的 Slot 只接受「单个 React 元素」子节点，传字符串会直接抛
            「Primitive.p failed to slot onto its children」，一开弹窗整页就 Application error。
            所以这里按类型分流：字符串交给它自己渲染的 <p>，JSX 才用 asChild 顶替。
          */}
          {description ? (
            typeof description === 'string' ? (
              <AlertDialogDescription>{description}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription asChild>{description}</AlertDialogDescription>
            )
          ) : null}
        </AlertDialogHeader>

        {requireText ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="confirm-text" className="text-sm text-neutral-600">
              输入 <span className="font-medium text-neutral-900">{requireText}</span> 以确认
            </label>
            <input
              autoComplete="off"
              spellCheck={false}
              id="confirm-text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="h-9 rounded-md border border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={blocked || pending}
            className={cn(destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
          >
            {pending ? '处理中…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
