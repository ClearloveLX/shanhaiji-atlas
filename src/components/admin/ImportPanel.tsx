'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, FileJson, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { applyImport, exportAllCsv, exportAllJson, previewImport, snapshotBeforeImport, type ImportPreview } from '@/actions/imports';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ConflictStrategy = 'skip' | 'overwrite' | 'new-slug';

const STRATEGIES: Array<{ value: ConflictStrategy; label: string; hint: string }> = [
  { value: 'skip', label: '跳过', hint: 'slug 已存在的条目原样不动' },
  { value: 'overwrite', label: '覆盖', hint: '用导入的数据整条覆盖已有条目' },
  { value: 'new-slug', label: '生成新 slug', hint: '新建一条，slug 后面加随机后缀' },
];

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** 导入导出面板：导出直接下载；导入先预检、确认后才写库，写之前自动留回滚点 */
export default function ImportPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [raw, setRaw] = useState('');
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [snapshotPath, setSnapshotPath] = useState<string | null>(null);

  function handleExportJson() {
    startTransition(async () => {
      const result = await exportAllJson();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      downloadText(result.data.filename, result.data.json, 'application/json');
      toast.success(`已导出 ${result.data.count} 条`);
    });
  }

  function handleExportCsv() {
    startTransition(async () => {
      const result = await exportAllCsv();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      downloadText(result.data.filename, result.data.csv, 'text/csv;charset=utf-8');
      toast.success(`已导出 ${result.data.count} 条`);
    });
  }

  function handlePreview() {
    if (!raw.trim()) {
      toast.error('先粘贴 JSON 或选择文件');
      return;
    }

    startTransition(async () => {
      const result = await previewImport(raw, strategy);
      if (!result.ok) {
        toast.error(result.error);
        setPreview(null);
        return;
      }
      setPreview(result.data);
      toast.success('预检完成，确认无误后再点「确认导入」');
    });
  }

  function handleApply() {
    if (!preview) return;

    startTransition(async () => {
      // 每次导入前自动留一个回滚点
      const snapshot = await snapshotBeforeImport();
      if (snapshot.ok) {
        setSnapshotPath(snapshot.data.path);
      } else {
        toast.error(`回滚点没生成成功，先不导入：${snapshot.error}`);
        return;
      }

      const result = await applyImport(raw, strategy);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const { created, updated, skipped } = result.data;
      toast.success(`导入完成：新增 ${created}、更新 ${updated}、跳过 ${skipped}`);
      setPreview(null);
      setRaw('');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="rounded-lg py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">导出</CardTitle>
          <CardDescription className="text-xs">
            导出的 JSON 含全部条目与标签关系（私密内容也在里面），**不要放公共网盘、不要提交进 Git**。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 px-5">
          <Button type="button" onClick={handleExportJson} disabled={pending}>
            <FileJson className="size-4" aria-hidden />
            导出全站 JSON
          </Button>
          <Button type="button" variant="outline" onClick={handleExportCsv} disabled={pending}>
            <Download className="size-4" aria-hidden />
            导出 CSV（给 Excel 批量编辑）
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-lg py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">导入</CardTitle>
          <CardDescription className="text-xs">
            先预检再写库。每次确认导入前会自动把当前全站数据导一份到 data/backups/ 作为回滚点。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setRaw(text);
                setPreview(null);
                toast.success(`已读取 ${file.name}`);
              }}
              className="text-sm"
              aria-label="选择要导入的 JSON 文件"
            />
            <span className="text-xs text-neutral-400">或者直接把 JSON 粘在下面的框里</span>
          </div>

          <Textarea
            autoComplete="off"
            spellCheck={false}
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setPreview(null);
            }}
            rows={8}
            placeholder='{ "entries": [ { "type": "tool", "linkMode": "external", "slug": "...", "name": "...", "summary": "...", "tags": { "scene": ["work"], "attr": [] } } ] }'
            className="font-mono text-xs"
            aria-label="要导入的 JSON"
          />

          <fieldset className="flex flex-wrap items-center gap-3">
            <legend className="text-sm text-neutral-600">slug 冲突时</legend>
            {STRATEGIES.map((option) => (
              <label key={option.value} className="flex items-center gap-1.5 text-sm" title={option.hint}>
                <input
                  type="radio"
                  name="import-strategy"
                  className="size-4 accent-neutral-900"
                  checked={strategy === option.value}
                  onChange={() => {
                    setStrategy(option.value);
                    setPreview(null);
                  }}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handlePreview} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              预检
            </Button>
            <Button type="button" onClick={handleApply} disabled={pending || !preview}>
              <Upload className="size-4" aria-hidden />
              确认导入
            </Button>
          </div>

          {snapshotPath ? (
            <p className="text-xs text-neutral-500">回滚点已生成：{snapshotPath}</p>
          ) : null}

          {preview ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">新增 {preview.createCount}</span>
                <span className="rounded-md bg-sky-50 px-2 py-1 text-sky-700">更新 {preview.updateCount}</span>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">冲突/跳过 {preview.conflictCount}</span>
                {preview.invalidCount > 0 ? (
                  <span className="flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-rose-700">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    不合法 {preview.invalidCount}
                  </span>
                ) : null}
              </div>

              <div className="max-h-[360px] overflow-auto rounded-md border border-neutral-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">slug</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>动作</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.items.map((item, index) => (
                      <TableRow key={`${item.slug}-${index}`}>
                        <TableCell className="pl-4 font-mono text-xs">{item.slug}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs',
                              item.action === 'create' && 'bg-emerald-50 text-emerald-700',
                              item.action === 'update' && 'bg-sky-50 text-sky-700',
                              item.action === 'conflict' && 'bg-amber-50 text-amber-700',
                            )}
                          >
                            {item.action === 'create' ? '新增' : item.action === 'update' ? '更新' : '冲突'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-neutral-500">{item.reason ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
