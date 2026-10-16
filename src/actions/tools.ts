'use server';

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryTools } from '@/db/schema';

/**
 * 自研工具运行页的用量打点。
 *
 * ⚠️ 这是全项目唯一一个「不需要 requireAdmin」的写 Server Action —— 它由匿名访客触发，
 * 和 /go 的点击统计同一性质（docs/DATA-MODEL.md 4.2：进入工具页打一次 usage_count）。
 * 因此刻意做了三条限制：只能自增一个计数器、不写任何业务数据、不对内网暴露额外信息。
 */
export async function incrementToolUsage(entryId: string): Promise<void> {
  if (!entryId) return;

  const row = db
    .select({ entryId: entryTools.entryId })
    .from(entryTools)
    .innerJoin(entries, eq(entries.id, entryTools.entryId))
    .where(and(eq(entryTools.entryId, entryId), eq(entries.linkMode, 'internal')))
    .get();

  if (!row) return;

  db.update(entryTools)
    .set({ usageCount: sql`${entryTools.usageCount} + 1` })
    .where(eq(entryTools.entryId, entryId))
    .run();
}
