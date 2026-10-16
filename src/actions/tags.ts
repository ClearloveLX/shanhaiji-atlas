'use server';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entryTags, tags } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { revalidateSiteWide, revalidateTagPaths } from '@/lib/revalidate';
import { mergeTagsInputSchema, tagInputSchema } from '@/lib/validation';
import type { ActionResult } from '@/types';

/** 标签的增删改、合并、排序。每个函数第一行都是 requireAdmin()。 */

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export async function createTag(input: unknown): Promise<ActionResult<{ id: string; dim: string; slug: string }>> {
  await requireAdmin();

  const parsed = tagInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '标签信息不合法');
  }

  const { dim, slug, name, color, icon, desc, sort } = parsed.data;

  const existing = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.dim, dim), eq(tags.slug, slug)))
    .get();

  if (existing) {
    return fail(`${dim} 维度下已经有 slug「${slug}」的标签了`);
  }

  const inserted = db
    .insert(tags)
    .values({ dim, slug, name, color, icon, desc, sort })
    .returning({ id: tags.id })
    .get();

  revalidateTagPaths({ dim, slug });
  return { ok: true, data: { id: inserted.id, dim, slug } };
}

export async function updateTag(id: string, input: unknown): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const parsed = tagInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '标签信息不合法');
  }

  const current = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!current) return fail('标签不存在');

  const { dim, slug, name, color, icon, desc, sort } = parsed.data;

  const clash = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.dim, dim), eq(tags.slug, slug), ne(tags.id, id)))
    .get();

  if (clash) {
    return fail(`${dim} 维度下已经有 slug「${slug}」的标签了`);
  }

  db.update(tags).set({ dim, slug, name, color, icon, desc, sort }).where(eq(tags.id, id)).run();

  // slug 改过的话，旧标签页也要刷
  revalidateTagPaths({ dim: current.dim, slug: current.slug });
  revalidateTagPaths({ dim, slug });
  return { ok: true, data: undefined };
}

export type DeleteTagMode = 'detach' | 'move';

/**
 * 删除标签。
 * 被条目引用时不允许直接删：要么把引用改到另一个标签（move），要么只解除引用（detach）。
 */
export async function deleteTag(id: string, mode: DeleteTagMode = 'detach', targetTagId?: string): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!current) return fail('标签不存在');

  const usage = db
    .select({ count: sql<number>`count(*)` })
    .from(entryTags)
    .where(eq(entryTags.tagId, id))
    .get();
  const usedBy = usage?.count ?? 0;

  try {
    db.transaction((tx) => {
      if (usedBy > 0 && mode === 'move') {
        if (!targetTagId) throw new Error('NO_TARGET');
        const target = tx.select().from(tags).where(eq(tags.id, targetTagId)).get();
        if (!target) throw new Error('NO_TARGET');
        if (target.dim !== current.dim) throw new Error('DIM_MISMATCH');

        const affected = tx.select({ entryId: entryTags.entryId }).from(entryTags).where(eq(entryTags.tagId, id)).all();

        for (const row of affected) {
          tx.insert(entryTags).values({ entryId: row.entryId, tagId: targetTagId }).onConflictDoNothing().run();
        }
      }

      tx.delete(entryTags).where(eq(entryTags.tagId, id)).run();
      tx.delete(tags).where(eq(tags.id, id)).run();
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'NO_TARGET') return fail('请选择要改到的目标标签');
    if (code === 'DIM_MISMATCH') return fail('目标标签必须和当前标签同维度');
    throw error;
  }

  revalidateTagPaths(current);
  revalidateSiteWide();
  return { ok: true, data: undefined };
}

/** 合并标签：把 sourceIds 的引用全部改到 targetId，然后删掉它们。整个过程在一个事务里。 */
export async function mergeTags(sourceIds: string[], targetId: string): Promise<ActionResult<{ moved: number }>> {
  await requireAdmin();

  const parsed = mergeTagsInputSchema.safeParse({ sourceIds, targetId });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '合并参数不合法');
  }

  const target = db.select().from(tags).where(eq(tags.id, targetId)).get();
  if (!target) return fail('要保留的标签不存在');

  const sources = db
    .select()
    .from(tags)
    .where(inArray(tags.id, sourceIds.filter((id) => id !== targetId)))
    .all();

  if (sources.length === 0) return fail('没有需要合并的标签');

  const mismatched = sources.find((source) => source.dim !== target.dim);
  if (mismatched) return fail(`「${mismatched.name}」和「${target.name}」不在同一个维度，不能合并`);

  let moved = 0;

  db.transaction((tx) => {
    for (const source of sources) {
      const affected = tx.select({ entryId: entryTags.entryId }).from(entryTags).where(eq(entryTags.tagId, source.id)).all();
      for (const row of affected) {
        tx.insert(entryTags).values({ entryId: row.entryId, tagId: targetId }).onConflictDoNothing().run();
        moved += 1;
      }
      tx.delete(entryTags).where(eq(entryTags.tagId, source.id)).run();
      tx.delete(tags).where(eq(tags.id, source.id)).run();
    }
  });

  revalidateSiteWide();
  return { ok: true, data: { moved } };
}

/** 拖拽排序：按传入顺序写 sort */
export async function reorderTags(dim: string, orderedIds: string[]): Promise<ActionResult<undefined>> {
  await requireAdmin();

  db.transaction((tx) => {
    orderedIds.forEach((id, index) => {
      tx.update(tags)
        .set({ sort: (index + 1) * 10 })
        .where(and(eq(tags.id, id), eq(tags.dim, dim)))
        .run();
    });
  });

  revalidateSiteWide();
  return { ok: true, data: undefined };
}
