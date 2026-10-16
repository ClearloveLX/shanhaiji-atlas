'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_QR_OPTIONS, renderQrDataUrl, validateQrText, type QrOptions } from './lib/qr';

const LEVELS: Array<{ value: QrOptions['level']; label: string; hint: string }> = [
  { value: 'L', label: 'L', hint: '约 7% 容错，图案最稀疏' },
  { value: 'M', label: 'M', hint: '约 15% 容错，日常够用（默认）' },
  { value: 'Q', label: 'Q', hint: '约 25% 容错，适合印刷' },
  { value: 'H', label: 'H', hint: '约 30% 容错，可加 logo，图案最密' },
];

export default function QrGeneratorTool() {
  const [options, setOptions] = useState<QrOptions>(DEFAULT_QR_OPTIONS);
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const trimmed = options.text.trim();

  useEffect(() => {
    const invalid = validateQrText(options.text);
    if (invalid) {
      setDataUrl('');
      setError(null);
      return;
    }

    let cancelled = false;
    setRendering(true);
    setError(null);

    renderQrDataUrl({ ...options, text: trimmed })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl('');
          setError('生成失败，内容可能太长，试着缩短一点');
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
    };
    // options 里每个字段都会影响图案，整体作为依赖
  }, [options, trimmed]);

  const charCount = useMemo(() => options.text.length, [options.text]);

  function update<K extends keyof QrOptions>(key: K, value: QrOptions[K]) {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }

  function download() {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qrcode-${options.size}.png`;
    link.click();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="qr-text">内容</Label>
        <Textarea
          autoComplete="off"
          spellCheck={false}
          id="qr-text"
          value={options.text}
          onChange={(event) => update('text', event.target.value)}
          placeholder="粘贴网址、一段文字、Wi-Fi 信息都可以"
          rows={3}
          aria-describedby="qr-text-hint"
        />
        <p id="qr-text-hint" className="text-xs text-muted-foreground">
          已输入 {charCount} 个字符
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="qr-size">图片边长（px）</Label>
          <Input
            autoComplete="off"
            spellCheck={false}
            id="qr-size"
            type="number"
            min={128}
            max={1024}
            step={32}
            value={options.size}
            onChange={(event) => update('size', Number(event.target.value) || DEFAULT_QR_OPTIONS.size)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="qr-margin">白边（模块数）</Label>
          <Input
            autoComplete="off"
            spellCheck={false}
            id="qr-margin"
            type="number"
            min={0}
            max={8}
            value={options.margin}
            onChange={(event) => update('margin', Number(event.target.value) || 0)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="qr-dark">前景色</Label>
          <Input
            autoComplete="off"
            spellCheck={false}
            id="qr-dark"
            type="color"
            className="h-9 p-1"
            value={options.dark}
            onChange={(event) => update('dark', event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="qr-light">背景色</Label>
          <Input
            autoComplete="off"
            spellCheck={false}
            id="qr-light"
            type="color"
            className="h-9 p-1"
            value={options.light}
            onChange={(event) => update('light', event.target.value)}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">容错等级</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((level) => (
            <Button
              key={level.value}
              type="button"
              variant={options.level === level.value ? 'default' : 'outline'}
              size="sm"
              title={level.hint}
              aria-pressed={options.level === level.value}
              onClick={() => update('level', level.value)}
            >
              {level.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {LEVELS.find((level) => level.value === options.level)?.hint}
        </p>
      </fieldset>

      <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-background p-4">
        <div className="flex min-h-[220px] w-full items-center justify-center">
          {dataUrl ? (
            // 二维码是本地生成的 dataURL，不经过任何图片服务
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt="生成的二维码预览"
              width={Math.min(options.size, 260)}
              height={Math.min(options.size, 260)}
              className="rounded-md border border-border"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {rendering ? <Loader2 className="size-4 animate-spin" aria-hidden /> : '输入内容后这里会显示二维码'}
            </p>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="button" onClick={download} disabled={!dataUrl}>
          <Download className="size-4" aria-hidden />
          下载 PNG
        </Button>
      </div>
    </div>
  );
}
