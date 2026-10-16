'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, ImageUp, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { deactivateExpiredQrcodes, toggleQrcodeActive, updateQrcode } from '@/actions/qrcodes';
import { uploadImage } from '@/actions/uploads';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type QrcodeBoardItem = {
  id: string;
  label: string;
  kind: string;
  image: string;
  tip: string | null;
  expiresAt: string | null;
  isActive: boolean;
  showCount: number;
  entryId: string;
  entryName: string;
  entrySlug: string;
  entryType: string;
  /** 状态：expired / soon / ok / inactive */
  status: 'expired' | 'soon' | 'ok' | 'inactive';
  remainingLabel: string;
};

const KIND_LABELS: Record<string, string> = {
  'wechat-group': '微信群',
  'wechat-personal': '个人微信',
  'wechat-oa': '公众号',
  miniprogram: '小程序码',
  alipay: '支付宝',
  custom: '其它',
};

const STATUS_STYLES: Record<string, string> = {
  expired: 'bg-rose-50 text-rose-700',
  soon: 'bg-amber-50 text-amber-700',
  ok: 'bg-emerald-50 text-emerald-700',
  inactive: 'bg-neutral-100 text-neutral-500',
};

const STATUS_LABELS: Record<string, string> = {
  expired: '已过期',
  soon: '快过期',
  ok: '有效',
  inactive: '已停用',
};

/** 二维码看板：按过期时间升序，支持换图 / 改期 / 停用 */
export default function QrcodeBoard({ items }: { items: QrcodeBoardItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function changeExpiry(item: QrcodeBoardItem, value: string) {
    setBusyId(item.id);
    startTransition(async () => {
      const result = await updateQrcode(item.id, {
        expiresAt: value ? new Date(`${value}T23:59:59`) : null,
      });
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('过期时间已更新');
      router.refresh();
    });
  }

  async function replaceImage(item: QrcodeBoardItem, file: File) {
    setBusyId(item.id);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', 'qrcodes');
      formData.append('visibility', 'public');
      formData.append('filename', `${item.entrySlug}-${item.id.slice(0, 6)}.png`);

      const uploaded = await uploadImage(formData);
      if (!uploaded.ok) {
        toast.error(uploaded.error);
        return;
      }

      const result = await updateQrcode(item.id, { image: uploaded.data.url });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success('二维码已更换');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">按过期时间升序：最快过期的排最前面。</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await deactivateExpiredQrcodes();
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(result.data.affected > 0 ? `已停用 ${result.data.affected} 张过期二维码` : '没有已过期的二维码');
              router.refresh();
            });
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Ban className="size-4" aria-hidden />}
          一键停用所有已过期的码
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">预览</TableHead>
              <TableHead>条目</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>过期时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">展开次数</TableHead>
              <TableHead className="pr-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-sm text-neutral-500">
                  还没有二维码。在条目编辑页的「二维码」区块里添加。
                </TableCell>
              </TableRow>
            ) : null}

            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="pl-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt={`${item.label}二维码`}
                    className="size-12 rounded border border-neutral-200 object-contain"
                  />
                </TableCell>

                <TableCell>
                  <Link href={`/admin/entries/${item.entryId}/edit`} className="font-medium hover:underline">
                    {item.entryName}
                  </Link>
                </TableCell>

                <TableCell>{item.label}</TableCell>
                <TableCell className="text-neutral-500">{KIND_LABELS[item.kind] ?? item.kind}</TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <input
                      autoComplete="off"
                      spellCheck={false}
                      type="date"
                      defaultValue={item.expiresAt ? item.expiresAt.slice(0, 10) : ''}
                      onChange={(event) => changeExpiry(item, event.target.value)}
                      aria-label={`修改 ${item.label} 的过期时间`}
                      className="h-8 rounded-md border border-input px-2 text-xs outline-none focus-visible:border-ring"
                    />
                    <span className="text-xs text-neutral-400">{item.remainingLabel}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_STYLES[item.status])}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </TableCell>

                <TableCell className="text-right tabular-nums text-neutral-500">{item.showCount}</TableCell>

                <TableCell className="pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-neutral-100">
                      {busyId === item.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <ImageUp className="size-3.5" aria-hidden />
                      )}
                      换图
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void replaceImage(item, file);
                          event.target.value = '';
                        }}
                      />
                    </label>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={pending}
                      onClick={() => {
                        setBusyId(item.id);
                        startTransition(async () => {
                          const result = await toggleQrcodeActive(item.id, !item.isActive);
                          setBusyId(null);
                          if (!result.ok) {
                            toast.error(result.error);
                            return;
                          }
                          toast.success(item.isActive ? '已停用（前台不再展示）' : '已启用');
                          router.refresh();
                        });
                      }}
                    >
                      <RefreshCw className="size-3.5" aria-hidden />
                      {item.isActive ? '停用' : '启用'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
