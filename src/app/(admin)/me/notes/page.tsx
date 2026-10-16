import type { Metadata } from 'next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMeNotes } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { formatDate, formatRelative } from '@/lib/utils';
import Link from 'next/link';

export const metadata: Metadata = { title: '站长区 · 笔记', robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = {
  todo: '想去',
  visited: '去过',
  verified: '已验证',
  avoid: '踩雷',
};

/** 私人笔记流：entry_private.note 按更新时间排 */
export default async function MeNotesPage() {
  await requireAdmin();

  const notes = await getMeNotes(100);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        笔记
        <span className="ml-2 text-sm font-normal text-neutral-500">共 {notes.length} 条</span>
      </h1>

      {notes.length === 0 ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">还没有笔记</CardTitle>
            <CardDescription className="text-xs">
              在条目编辑页的「私密信息」里写点东西（比如「别周末去」「实际人均 80」），就会出现在这里。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ul className="flex flex-col gap-3">
        {notes.map((note) => (
          <li key={note.entryId} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/me/entries/${note.entryId}`} className="font-medium hover:underline">
                {note.entryName}
              </Link>
              {note.status ? (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                  {STATUS_LABELS[note.status] ?? note.status}
                </span>
              ) : null}
              {note.rating ? <span className="text-xs text-amber-600">{'★'.repeat(note.rating)}</span> : null}
              {note.paid ? <span className="text-xs text-neutral-500">花费：{note.paid}</span> : null}
              {note.visitedOn ? <span className="text-xs text-neutral-500">到访：{formatDate(note.visitedOn)}</span> : null}
              <span className="ml-auto text-[11px] text-neutral-400">{formatRelative(note.updatedAt)}</span>
            </div>

            {note.note ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-700">{note.note}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
