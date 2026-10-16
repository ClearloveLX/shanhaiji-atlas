'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, ImageUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage } from '@/actions/uploads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { QrcodeInput } from '@/lib/validation';

export type QrcodeKind = QrcodeInput['kind'];

export type QrcodeDraft = {
  id?: string;
  label: string;
  kind: QrcodeKind;
  image: string;
  tip?: string;
  expiresAt?: Date | null;
  isActive?: boolean;
  sort?: number;
};

const KIND_OPTIONS: Array<{ value: QrcodeKind; label: string }> = [
  { value: 'wechat-group', label: '微信群（7 天过期）' },
  { value: 'wechat-personal', label: '个人微信' },
  { value: 'wechat-oa', label: '公众号' },
  { value: 'miniprogram', label: '小程序码' },
  { value: 'alipay', label: '支付宝' },
  { value: 'custom', label: '其它' },
];

function toDateInputValue(value: Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function defaultExpiry(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 59, 0);
  return date;
}

/**
 * 二维码管理器：一个条目可以挂多张码，每张有各自的 label 和过期时间。
 * 微信群码 7 天失效是运营里最容易翻车的事，所以选这个类型时自动填「今天 + 7 天」并给黄字提醒。
 */
export default function QrcodeManager({
  value,
  slug,
  entryId,
  onChange,
  disabled = false,
}: {
  value: QrcodeDraft[];
  slug?: string;
  entryId?: string;
  onChange: (next: QrcodeDraft[]) => void;
  disabled?: boolean;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const fileInputs = useRef<Array<HTMLInputElement | null>>([]);

  function update(index: number, patch: Partial<QrcodeDraft>) {
    onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(value.filter((_, position) => position !== index));
  }

  function add() {
    onChange([
      ...value,
      { label: '', kind: 'wechat-personal', image: '', tip: '', expiresAt: null, isActive: true, sort: value.length * 10 },
    ]);
  }

  async function handleUpload(index: number, file: File) {
    setUploadingIndex(index);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', 'qrcodes');
    formData.append('visibility', 'public');
    formData.append('filename', `${slug || 'qrcode'}-${index + 1}.png`);
    if (entryId) formData.append('entryId', entryId);

    try {
      const result = await uploadImage(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      update(index, { image: result.data.url });
      toast.success('二维码已上传到自己的服务器');
    } finally {
      setUploadingIndex(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500">
          还没有二维码。微信群的码 7 天就会失效，挂上来之后记得每周看一眼后台的二维码看板。
        </p>
      ) : null}

      {value.map((qrcode, index) => {
        const isGroup = qrcode.kind === 'wechat-group';
        const expired = qrcode.expiresAt ? new Date(qrcode.expiresAt).getTime() < Date.now() : false;

        return (
          <div key={index} className="rounded-md border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-neutral-500">二维码 {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive"
                disabled={disabled}
                onClick={() => remove(index)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                删除
              </Button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`qr-label-${index}`}>标签（必填）</Label>
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  id={`qr-label-${index}`}
                  value={qrcode.label}
                  disabled={disabled}
                  placeholder="店主微信 / 外卖群 / 公众号"
                  onChange={(event) => update(index, { label: event.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`qr-kind-${index}`}>类型</Label>
                <select
                  id={`qr-kind-${index}`}
                  value={qrcode.kind}
                  disabled={disabled}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                  onChange={(event) => {
                    const option = KIND_OPTIONS.find((item) => item.value === event.target.value);
                    if (!option) return;
                    update(index, {
                      kind: option.value,
                      expiresAt: option.value === 'wechat-group' ? (qrcode.expiresAt ?? defaultExpiry()) : qrcode.expiresAt,
                    });
                  }}
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`qr-expires-${index}`}>过期时间（可空）</Label>
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  id={`qr-expires-${index}`}
                  type="date"
                  value={toDateInputValue(qrcode.expiresAt)}
                  disabled={disabled}
                  onChange={(event) =>
                    update(index, { expiresAt: event.target.value ? new Date(`${event.target.value}T23:59:59`) : null })
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`qr-tip-${index}`}>码下方提示（选填）</Label>
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  id={`qr-tip-${index}`}
                  value={qrcode.tip ?? ''}
                  disabled={disabled}
                  placeholder="加好友请备注「山海集」"
                  onChange={(event) => update(index, { tip: event.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`qr-image-${index}`}>图片</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    autoComplete="off"
                    spellCheck={false}
                    id={`qr-image-${index}`}
                    value={qrcode.image}
                    disabled={disabled}
                    placeholder="/media/qrcodes/xxx.png"
                    onChange={(event) => update(index, { image: event.target.value })}
                    className="flex-1"
                  />
                  <input
                    autoComplete="off"
                    spellCheck={false}
                    ref={(element) => {
                      fileInputs.current[index] = element;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(index, file);
                      event.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled || uploadingIndex === index}
                    onClick={() => fileInputs.current[index]?.click()}
                  >
                    {uploadingIndex === index ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <ImageUp className="size-4" aria-hidden />
                    )}
                    上传
                  </Button>
                  {qrcode.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrcode.image} alt="" className="size-10 rounded border border-neutral-200 object-contain" />
                  ) : null}
                </div>
                <p className="text-xs text-neutral-400">
                  微信识别对清晰度敏感：边长至少 430px、用 PNG，不要转 webp，也不要做统一压缩。
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="size-4 accent-neutral-900"
                  checked={qrcode.isActive ?? true}
                  disabled={disabled}
                  onChange={(event) => update(index, { isActive: event.target.checked })}
                />
                在详情页展示这张码
              </label>
            </div>

            {isGroup ? (
              <p className={cn('mt-2 flex items-center gap-1.5 text-xs', expired ? 'text-destructive' : 'text-amber-600')}>
                <AlertTriangle className="size-3.5" aria-hidden />
                微信群二维码 7 天后失效，到期记得更换（默认已填今天 + 7 天）
              </p>
            ) : null}
          </div>
        );
      })}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus className="size-4" aria-hidden />
          添加二维码
        </Button>
      </div>
    </div>
  );
}
