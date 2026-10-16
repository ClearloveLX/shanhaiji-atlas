'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryQrcodes } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { sweepExpiredQrcodes } from '@/lib/qrcodes';
import { revalidateEntryPaths } from '@/lib/revalidate';
import { qrcodeInputSchema } from '@/lib/validation';
import type { ActionResult } from '@/types';

/**
 * 二维码「展开查看」次数。
 * 和 /go 的点击统计一样，这是匿名的展示统计，所以不 requireAdmin；
 * 只允许对**未删除条目**的**启用中**二维码自增一个计数器。
 */
export async function incrementQrcodeShow(qrcodeId: string): Promise<void> {
  if (!qrcodeId) return;

  const row = db
    .select({ id: entryQrcodes.id })
    .from(entryQrcodes)
    .innerJoin(entries, eq(entries.id, entryQrcodes.entryId))
    .where(sql`${entryQrcodes.id} = ${qrcodeId} and ${entryQrcodes.isActive} = 1 and ${entries.deletedAt} is null`)
    .get();

  if (!row) return;

  db.update(entryQrcodes)
    .set({ showCount: sql`${entryQrcodes.showCount} + 1` })
    .where(eq(entryQrcodes.id, qrcodeId))
    .run();
}

/* ────────────────────────── 后台维护（都要 requireAdmin） ────────────────────────── */

async function entryOfQrcode(qrcodeId: string): Promise<{ entryId: string; type: string; slug: string } | null> {
  const row = db
    .select({ entryId: entries.id, type: entries.type, slug: entries.slug })
    .from(entryQrcodes)
    .innerJoin(entries, eq(entries.id, entryQrcodes.entryId))
    .where(eq(entryQrcodes.id, qrcodeId))
    .get();

  return row ?? null;
}

/** 改二维码：换图、改期、改标签、启用停用 —— 只传要改的字段 */
export async function updateQrcode(
  id: string,
  patch: { label?: string; kind?: string; image?: string; tip?: string; expiresAt?: Date | null; isActive?: boolean },
): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(entryQrcodes).where(eq(entryQrcodes.id, id)).get();
  if (!current) return { ok: false, error: '二维码不存在' };

  const merged = {
    label: patch.label ?? current.label,
    kind: patch.kind ?? current.kind,
    image: patch.image ?? current.image,
    tip: patch.tip ?? current.tip ?? '',
    expiresAt: patch.expiresAt === undefined ? current.expiresAt : patch.expiresAt,
    isActive: patch.isActive ?? current.isActive,
  };

  const parsed = qrcodeInputSchema.safeParse({ ...merged, sort: current.sort });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '二维码信息不合法' };
  }

  db.update(entryQrcodes)
    .set({
      label: parsed.data.label,
      kind: parsed.data.kind,
      image: parsed.data.image,
      tip: parsed.data.tip,
      expiresAt: parsed.data.expiresAt ?? null,
      isActive: parsed.data.isActive ?? true,
    })
    .where(eq(entryQrcodes.id, id))
    .run();

  const entry = await entryOfQrcode(id);
  if (entry) revalidateEntryPaths({ type: entry.type, slug: entry.slug });

  return { ok: true, data: undefined };
}

/** 一键停用所有已过期的码（后台按钮用） */
export async function deactivateExpiredQrcodes(): Promise<ActionResult<{ affected: number }>> {
  await requireAdmin();

  const affected = await sweepExpiredQrcodes();
  return { ok: true, data: { affected } };
}

/** 看板里的「停用」开关（等同隐藏，不删数据） */
export async function toggleQrcodeActive(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const entry = await entryOfQrcode(id);
  if (!entry) return { ok: false, error: '二维码不存在' };

  db.update(entryQrcodes).set({ isActive }).where(eq(entryQrcodes.id, id)).run();
  revalidateEntryPaths({ type: entry.type, slug: entry.slug });

  return { ok: true, data: undefined };
}

/** 删除二维码（连带删掉磁盘上的图片） */
export async function deleteQrcode(id: string): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(entryQrcodes).where(eq(entryQrcodes.id, id)).get();
  if (!current) return { ok: false, error: '二维码不存在' };

  const entry = await entryOfQrcode(id);

  db.delete(entryQrcodes).where(eq(entryQrcodes.id, id)).run();

  const { deleteObject } = await import('@/lib/storage');
  await deleteObject(current.image).catch(() => undefined);

  if (entry) revalidateEntryPaths({ type: entry.type, slug: entry.slug });

  return { ok: true, data: undefined };
}
