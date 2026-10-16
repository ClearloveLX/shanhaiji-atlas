'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { buildDiffRows, summarize } from './lib/diff';

const KIND_STYLES: Record<string, string> = {
  added: 'bg-emerald-50 text-emerald-900',
  removed: 'bg-rose-50 text-rose-900 line-through decoration-rose-300',
  unchanged: '',
};

export default function TextDiffTool() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');

  const rows = useMemo(() => buildDiffRows(left, right), [left, right]);
  const summary = useMemo(() => summarize(rows), [rows]);

  const hasInput = left.length > 0 || right.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="diff-left">原文</Label>
          <Textarea
            autoComplete="off"
            spellCheck={false}
            id="diff-left"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder="把第一段文本粘在这里"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="diff-right">新文</Label>
          <Textarea
            autoComplete="off"
            spellCheck={false}
            id="diff-right"
            value={right}
            onChange={(event) => setRight(event.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder="把第二段文本粘在这里"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
          disabled={!hasInput}
        >
          <ArrowLeftRight className="size-4" aria-hidden />
          左右互换
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLeft('');
            setRight('');
          }}
          disabled={!hasInput}
        >
          <Eraser className="size-4" aria-hidden />
          清空
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          新增 {summary.added} 行 · 删除 {summary.removed} 行 · 相同 {summary.unchanged} 行
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">两边都填上内容后，这里会逐行标出差异。</p>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <caption className="sr-only">文本差异对比结果</caption>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.kind}-${index}`} className={KIND_STYLES[row.kind]}>
                    <td className="w-10 select-none border-r border-border px-2 py-0.5 text-right text-muted-foreground">
                      {row.leftLine ?? ''}
                    </td>
                    <td className="w-10 select-none border-r border-border px-2 py-0.5 text-right text-muted-foreground">
                      {row.rightLine ?? ''}
                    </td>
                    <td className="w-4 select-none px-1 py-0.5 text-center text-muted-foreground">
                      {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ''}
                    </td>
                    <td className="whitespace-pre-wrap break-all px-2 py-0.5">{row.text || ' '}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
