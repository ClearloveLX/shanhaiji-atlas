'use client';

import { useState } from 'react';
import { ChevronDown, QrCode } from 'lucide-react';
import { incrementQrcodeShow } from '@/actions/qrcodes';
import { cn } from '@/lib/utils';

export type QrcodeCardData = {
  id: string;
  label: string;
  tip: string | null;
  image: string;
  expiresAt: string | null;
};

const KIND_LABELS: Record<string, string> = {
  'wechat-group': '微信群',
  'wechat-personal': '个人微信',
  'wechat-oa': '公众号',
  miniprogram: '小程序码',
  alipay: '支付宝',
  custom: '二维码',
};

/**
 * 详情页的二维码区：默认折叠，点开才显示（不要一进页面就弹窗糊用户一脸）。
 * 展开时打一次 show_count + 1。
 */
export default function QrcodeCards({ items }: { items: Array<QrcodeCardData & { kind: string }> }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <section className="surface p-5" aria-labelledby="qrcode-heading">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            for (const item of items) {
              void incrementQrcodeShow(item.id).catch(() => {
                // 统计失败不影响展示
              });
            }
          }
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span id="qrcode-heading" className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="size-4 text-muted-foreground" aria-hidden />
          扫码联系（{items.length}）
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3">
              {/* 二维码是本地存储的图片，不引用第三方图床 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={`${item.label}二维码`}
                width={120}
                height={120}
                className="size-[120px] shrink-0 rounded-lg border border-border bg-qr-surface object-contain p-1"
              />
              <div className="min-w-0 text-sm">
                <p className="font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{KIND_LABELS[item.kind] ?? '二维码'}</p>
                {item.tip ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.tip}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
