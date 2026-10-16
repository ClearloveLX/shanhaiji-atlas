import EntryCard, { type EntryCardData } from '@/components/card/EntryCard';
import { cn } from '@/lib/utils';

/** 卡片网格：移动端 1 列，sm 2 列，lg 3 列 */
export default function EntryGrid({
  entries,
  showType = false,
  className,
  cityOf,
}: {
  entries: EntryCardData[];
  showType?: boolean;
  className?: string;
  cityOf?: Record<string, string | null>;
}) {
  if (entries.length === 0) return null;

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {entries.map((entry) => (
        <EntryCard key={entry.id} entry={{ ...entry, city: cityOf?.[entry.id] ?? null }} showType={showType} />
      ))}
    </div>
  );
}
