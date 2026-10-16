import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clickLogs, entries } from '@/db/schema';

/**
 * 外链点击统计。
 * 唯一的写入方是 /go/{slug} 这个公开 Route Handler —— 访客点链接时记一次，
 * 所以这里不能 requireAdmin（见 docs/DATA-MODEL.md 4.1）。
 * 只按天聚合，不存明细行：一年最多「条目数 × 365」行，写入是 ON CONFLICT DO UPDATE，极快。
 */

/** 本地时间（TZ）的 YYYY-MM-DD */
export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** n 天前（含今天为 0）的日期键 */
export function dayKeyAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return dayKey(date);
}

/** 记一次点击：click_logs 按天 +1，同时维护 entries.click_count 总数 */
export function recordClick(entryId: string): void {
  const day = dayKey();

  db.transaction((tx) => {
    tx.insert(clickLogs)
      .values({ entryId, day, count: 1 })
      .onConflictDoUpdate({
        target: [clickLogs.entryId, clickLogs.day],
        set: { count: sql`${clickLogs.count} + 1` },
      })
      .run();

    tx.update(entries)
      .set({ clickCount: sql`${entries.clickCount} + 1` })
      .where(eq(entries.id, entryId))
      .run();
  });
}
