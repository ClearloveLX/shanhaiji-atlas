import type { EntryWithTags } from '@/db/queries';
import Link from 'next/link';
import Image from 'next/image';
import { colorFromName, formatRelative, initialOf } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = { tool: '工具', site: '站点', shop: '店铺' };

const VISIBILITY_LABELS: Record<string, string> = {
  public: '公开',
  unlisted: '不列出',
  private: '私密',
};

/**
 * 站长区的条目列表（服务端组件）。
 * 复用前台卡片的信息结构，但带可见性标记、点击进 /me/entries/[id]。
 */
export default function MeEntryList({ entries }: { entries: EntryWithTags[] }) {
  if (entries.length === 0) {
    return <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">这里还没有内容。</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={`/me/entries/${entry.id}`}
            className="flex h-full flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              {entry.icon ? (
                <Image src={entry.icon} alt="" width={36} height={36} className="size-9 rounded-md border border-neutral-200 object-cover" unoptimized />
              ) : (
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-medium text-white"
                  style={{ backgroundColor: colorFromName(entry.name) }}
                >
                  {initialOf(entry.name)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium">{entry.name}</span>
                  <span className="text-[11px] text-neutral-400">{TYPE_LABELS[entry.type] ?? entry.type}</span>
                  {entry.visibility !== 'public' ? (
                    <span
                      className={
                        entry.visibility === 'private'
                          ? 'rounded-full bg-neutral-900 px-1.5 py-0.5 text-[11px] text-white'
                          : 'rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500'
                      }
                    >
                      {VISIBILITY_LABELS[entry.visibility]}
                    </span>
                  ) : null}
                  {entry.featured ? <span className="text-[11px] text-amber-600">精选</span> : null}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">{entry.summary}</p>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-1.5">
              {entry.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: `${tag.color}55`, color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              <span className="ml-auto text-[11px] text-neutral-400">{formatRelative(entry.updatedAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
