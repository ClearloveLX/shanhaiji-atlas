import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryQrcodes } from '@/db/schema';
import { revalidateEntryPaths } from '@/lib/revalidate';

/**
 * 过期二维码清扫。
 *
 * 放在 lib/ 而不是 actions/：/api/cron 和后台按钮都要用它，
 * 但它**不能**是一个可以从浏览器直接调的 Server Action ——
 * 只有 requireAdmin 过后的后台按钮，或者带 token 的 cron 才配触发。
 */
export async function sweepExpiredQrcodes(): Promise<number> {
  const now = new Date();

  const expired = db
    .select({ id: entryQrcodes.id, entryId: entryQrcodes.entryId })
    .from(entryQrcodes)
    .where(and(isNotNull(entryQrcodes.expiresAt), lt(entryQrcodes.expiresAt, now), eq(entryQrcodes.isActive, true)))
    .all();

  if (expired.length === 0) return 0;

  db.update(entryQrcodes)
    .set({ isActive: false })
    .where(and(isNotNull(entryQrcodes.expiresAt), lt(entryQrcodes.expiresAt, now), eq(entryQrcodes.isActive, true)))
    .run();

  // 关联条目的详情页要重新渲染：过期的码不该再出现在前台
  for (const row of expired) {
    const entry = db
      .select({ type: entries.type, slug: entries.slug })
      .from(entries)
      .where(eq(entries.id, row.entryId))
      .get();
    if (entry) revalidateEntryPaths(entry);
  }

  return expired.length;
}
