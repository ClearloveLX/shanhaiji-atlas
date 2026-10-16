'use client';

import { useRef, useState, useTransition } from 'react';
import { ImageUp, Loader2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchFavicon } from '@/actions/favicon';
import { uploadImage } from '@/actions/uploads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * 图标字段：拖拽/选择上传 + 从链接抓 favicon。
 * 上传前在客户端裁成 128×128 正方形（图标统一尺寸，卡片上不会一行高一行矮），
 * 然后走 src/lib/storage.ts 落到 data/uploads/public/icons/。
 */
export default function IconUploader({
  value,
  onChange,
  slug,
  sourceUrl,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  slug: string;
  /** 条目的外链，用来抓 favicon */
  sourceUrl?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'upload' | 'fetch' | null>(null);

  async function cropToSquare(file: File, size = 128): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持 canvas');

    // 居中裁成正方形再缩放
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('裁剪失败'))), 'image/png');
    });
  }

  /** SVG 直接原样上传：它是矢量的，裁成 128 位图就白瞎了（服务端会洗掉脚本能力） */
  async function uploadSvg(file: File): Promise<void> {
    const text = await file.text();
    const formData = new FormData();
    formData.append('file', new File([text], `${slug || 'icon'}.svg`, { type: 'image/svg+xml' }));
    formData.append('kind', 'icons');
    formData.append('visibility', 'public');
    formData.append('filename', `${slug || 'icon'}.svg`);

    const result = await uploadImage(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onChange(result.data.url);
    toast.success(result.data.cleaned ? '图标已上传（SVG，已清掉里面的脚本 / 外链）' : '图标已上传（SVG 矢量图）');
  }

  function handleFile(file: File) {
    setBusy('upload');
    startTransition(async () => {
      try {
        if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
          await uploadSvg(file);
          return;
        }

        const blob = await cropToSquare(file);
        const formData = new FormData();
        formData.append('file', new File([blob], `${slug || 'icon'}.png`, { type: 'image/png' }));
        formData.append('kind', 'icons');
        formData.append('visibility', 'public');
        formData.append('filename', `${slug || 'icon'}.png`);

        const result = await uploadImage(formData);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        onChange(result.data.url);
        toast.success('图标已上传（128×128）');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '处理图片失败');
      } finally {
        setBusy(null);
      }
    });
  }

  function handleFetch() {
    if (!sourceUrl) {
      toast.error('先填链接，才能按域名抓图标');
      return;
    }

    setBusy('fetch');
    startTransition(async () => {
      const result = await fetchFavicon(sourceUrl, slug);
      setBusy(null);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onChange(result.data.url);
      toast.success('已抓到图标并存到自己的服务器');
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="当前图标" className="size-10 rounded-md border border-neutral-200 object-cover" />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] text-neutral-400">
            无
          </span>
        )}

        <Input
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="/media/icons/xxx.png"
          className="min-w-[180px] flex-1"
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = '';
          }}
        />

        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === 'upload' || pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
          上传
        </Button>

        <Button type="button" variant="outline" disabled={disabled || busy !== null} onClick={handleFetch}>
          {busy === 'fetch' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
          抓 favicon
        </Button>

        {value ? (
          <Button type="button" variant="ghost" size="icon" aria-label="清空图标" onClick={() => onChange('')} disabled={disabled}>
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-neutral-400">
        PNG / JPG / WebP 会被裁成 128×128；SVG 原样保留（矢量图不裁，放大不糊），存到 data/uploads/public/icons/
        （不是 public/，那里每次部署都会被覆盖）。
      </p>
    </div>
  );
}
