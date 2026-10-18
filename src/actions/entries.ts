'use server';

import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryBranches, entryPrivate, entryQrcodes, entryTags, entryTools, tags } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { revalidateEntryPaths, revalidateSiteWide } from '@/lib/revalidate';
import { deleteIfUnused } from '@/lib/upload-gc';
import { entryInputSchema } from '@/lib/validation';
import { isToolSlug } from '@/tools/registry';
import type { ActionResult, EntryStatus, TagDim } from '@/types';

/**
 * 条目的增删改与批量操作。
 * 每个函数第一行都是 requireAdmin()，写完库必须调 revalidateEntryPaths —— 这是最容易漏的一步。
 */

type EntryInput = ReturnType<typeof entryInputSchema.parse>;

/* ────────────────────────── 内部工具 ────────────────────────── */

function tagKeysOf(input: EntryInput): string[] {
  const keys: string[] = [];
  for (const dim of ['topic', 'scene', 'attr', 'platform', 'price', 'quality'] as const) {
    for (const slug of input.tags[dim]) keys.push(`${dim}/${slug}`);
  }
  return keys;
}

async function validateInput(input: unknown): Promise<{ ok: true; data: EntryInput } | { ok: false; error: string }> {
  const parsed = entryInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.');
    return { ok: false, error: path ? `${path}：${issue?.message}` : (issue?.message ?? '表单校验失败') };
  }

  const data = parsed.data;

  // 自研工具：组件名必须在 registry 里注册过，否则数据库里会存进一个跑不起来的工具
  if (data.linkMode === 'internal') {
    const component = data.tool?.component ?? '';
    if (!isToolSlug(component)) {
      return {
        ok: false,
        error: `组件「${component}」未在 src/tools/registry.ts 注册，请先创建工具目录并注册`,
      };
    }
  }

  return { ok: true, data };
}

function syncTags(entryId: string, input: EntryInput): void {
  db.delete(entryTags).where(eq(entryTags.entryId, entryId)).run();

  const pairs: Array<{ dim: TagDim; slugs: string[] }> = [
    { dim: 'topic', slugs: input.tags.topic },
    { dim: 'scene', slugs: input.tags.scene },
    { dim: 'attr', slugs: input.tags.attr },
    { dim: 'platform', slugs: input.tags.platform },
    { dim: 'price', slugs: input.tags.price },
    { dim: 'quality', slugs: input.tags.quality },
  ];

  for (const { dim, slugs } of pairs) {
    if (slugs.length === 0) continue;

    const rows = db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.dim, dim), inArray(tags.slug, slugs)))
      .all();

    if (rows.length !== slugs.length) {
      const known = new Set(
        db
          .select({ slug: tags.slug })
          .from(tags)
          .where(and(eq(tags.dim, dim), inArray(tags.slug, slugs)))
          .all()
          .map((row) => row.slug),
      );
      const unknown = slugs.filter((slug) => !known.has(slug));
      throw new Error(`标签不存在：${dim}/${unknown.join('、')}`);
    }

    for (const row of rows) {
      db.insert(entryTags).values({ entryId, tagId: row.id }).onConflictDoNothing().run();
    }
  }
}

function syncBranches(entryId: string, input: EntryInput): void {
  db.delete(entryBranches).where(eq(entryBranches.entryId, entryId)).run();

  if (input.linkMode !== 'place') return;

  input.branches.forEach((branch, index) => {
    db.insert(entryBranches)
      .values({
        entryId,
        name: branch.name,
        address: branch.address,
        province: branch.province,
        city: branch.city,
        district: branch.district,
        lat: branch.lat ?? null,
        lng: branch.lng ?? null,
        poiSource: branch.poiSource ?? (branch.lat != null ? 'manual' : null),
        poiId: branch.poiId,
        phone: branch.phone,
        hours: branch.hours,
        priceLevel: branch.priceLevel ?? null,
        isPrimary: branch.isPrimary ?? index === 0,
        sort: branch.sort ?? index * 10,
        status: branch.status ?? 'active',
      })
      .run();
  });
}

function syncTool(entryId: string, input: EntryInput): void {
  if (input.linkMode !== 'internal') {
    db.delete(entryTools).where(eq(entryTools.entryId, entryId)).run();
    return;
  }

  const tool = input.tool;
  if (!tool) return;

  const existing = db.select({ entryId: entryTools.entryId }).from(entryTools).where(eq(entryTools.entryId, entryId)).get();

  const values = {
    component: tool.component,
    runtime: tool.runtime,
    requiresLogin: tool.requiresLogin,
    version: tool.version ?? null,
    changelog: tool.changelog,
  };

  if (existing) {
    db.update(entryTools).set(values).where(eq(entryTools.entryId, entryId)).run();
  } else {
    db.insert(entryTools).values({ entryId, ...values }).run();
  }
}

/** 二维码：整体替换（顺序也一起写回），过期时间原样存 */
function syncQrcodes(entryId: string, input: EntryInput): void {
  db.delete(entryQrcodes).where(eq(entryQrcodes.entryId, entryId)).run();

  input.qrcodes.forEach((qrcode, index) => {
    db.insert(entryQrcodes)
      .values({
        entryId,
        label: qrcode.label,
        kind: qrcode.kind,
        image: qrcode.image,
        tip: qrcode.tip,
        expiresAt: qrcode.expiresAt ?? null,
        isActive: qrcode.isActive ?? true,
        sort: qrcode.sort ?? index * 10,
      })
      .run();
  });
}

/** 私密信息（entry_private）：任何可见性都能填，只有站长看得到 */
function syncPrivateProfile(entryId: string, input: EntryInput): void {
  const profile = input.privateProfile ?? {};
  const hasContent =
    profile.rating != null ||
    profile.status != null ||
    Boolean(profile.note?.trim()) ||
    Boolean(profile.contact?.trim()) ||
    Boolean(profile.paid?.trim()) ||
    Boolean(profile.visitedOn?.trim());

  if (!hasContent) {
    db.delete(entryPrivate).where(eq(entryPrivate.entryId, entryId)).run();
    return;
  }

  const values = {
    rating: profile.rating ?? null,
    status: profile.status ?? null,
    note: profile.note?.trim() ? profile.note.trim() : null,
    contact: profile.contact?.trim() ? profile.contact.trim() : null,
    paid: profile.paid?.trim() ? profile.paid.trim() : null,
    visitedOn: profile.visitedOn?.trim() ? profile.visitedOn.trim() : null,
    updatedAt: new Date(),
  };

  const existing = db.select({ entryId: entryPrivate.entryId }).from(entryPrivate).where(eq(entryPrivate.entryId, entryId)).get();

  if (existing) {
    db.update(entryPrivate).set(values).where(eq(entryPrivate.entryId, entryId)).run();
  } else {
    db.insert(entryPrivate).values({ entryId, ...values }).run();
  }
}

function entryValues(input: EntryInput) {
  return {
    type: input.type,
    linkMode: input.linkMode,
    slug: input.slug,
    name: input.name,
    nameEn: input.nameEn ?? null,
    summary: input.summary,
    url: input.linkMode === 'external' ? (input.url ?? null) : null,
    icon: input.icon ?? null,
    cover: input.cover ?? null,
    /** 只有店铺用得上，其它类型一律存空，避免脏数据 */
    mapQuery: input.type === 'shop' ? (input.mapQuery ?? null) : null,
    note: input.note ?? null,
    meta: input.meta,
    visibility: input.visibility,
    featured: input.featured,
    status: input.status,
    sortWeight: input.sortWeight,
    updatedAt: new Date(),
  };
}

/**
 * 手动排序里权重 0 表示「没排过」。
 * 新建时留 0 的条目自动排到**整条列表最前面**（= 以前「最新收录」的观感），
 * 否则第一次调完顺序之后，新条目会掉到列表最后。
 */
function nextTopWeight(): number {
  const row = db
    .select({ max: sql<number>`max(${entries.sortWeight})` })
    .from(entries)
    .where(isNull(entries.deletedAt))
    .get();

  return (row?.max ?? 0) + 10;
}

/* ────────────────────────── 增删改 ────────────────────────── */

export async function createEntry(input: unknown): Promise<ActionResult<{ id: string; type: string; slug: string }>> {
  await requireAdmin();

  const validated = await validateInput(input);
  if (!validated.ok) return validated;

  const data = validated.data;

  const clash = db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.type, data.type), eq(entries.slug, data.slug)))
    .get();

  if (clash) {
    return { ok: false, error: `slug「${data.slug}」已被占用，请换一个` };
  }

  const sortWeight = data.sortWeight === 0 ? nextTopWeight() : data.sortWeight;

  let created = '';

  try {
    created = db.transaction((tx) => {
      const row = tx
        .insert(entries)
        .values({ ...entryValues(data), sortWeight, createdAt: new Date() })
        .returning({ id: entries.id })
        .get();

      return row.id;
    });

    syncTags(created, data);
    syncBranches(created, data);
    syncTool(created, data);
    syncQrcodes(created, data);
    syncPrivateProfile(created, data);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '保存失败' };
  }

  revalidateEntryPaths({ type: data.type, slug: data.slug, tagKeys: tagKeysOf(data) });
  revalidateSiteWide();

  return { ok: true, data: { id: created, type: data.type, slug: data.slug } };
}

export async function updateEntry(id: string, input: unknown): Promise<ActionResult<{ id: string; type: string; slug: string }>> {
  await requireAdmin();

  const validated = await validateInput(input);
  if (!validated.ok) return validated;

  const data = validated.data;

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!current) return { ok: false, error: '条目不存在' };

  if (current.linkMode !== data.linkMode) {
    return { ok: false, error: '不支持改形态（link_mode），请新建一条' };
  }

  const clash = db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.type, data.type), eq(entries.slug, data.slug), ne(entries.id, id)))
    .get();

  if (clash) {
    return { ok: false, error: `slug「${data.slug}」已被占用，请换一个` };
  }

  const previousTagKeys = db
    .select({ dim: tags.dim, slug: tags.slug })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(eq(entryTags.entryId, id))
    .all()
    .map((row) => `${row.dim}/${row.slug}`);

  try {
    db.update(entries).set(entryValues(data)).where(eq(entries.id, id)).run();
    syncTags(id, data);
    syncBranches(id, data);
    syncTool(id, data);
    syncQrcodes(id, data);
    syncPrivateProfile(id, data);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '保存失败' };
  }

  revalidateEntryPaths(
    { type: data.type, slug: data.slug, tagKeys: tagKeysOf(data) },
    { type: current.type, slug: current.slug, tagKeys: previousTagKeys },
  );
  revalidateSiteWide();

  // 换了图标 / 封面：旧文件没人用了就删掉（putObject 的文件名带内容指纹，换了就是新文件）
  const nextIcon = data.icon ?? null;
  const nextCover = data.cover ?? null;
  if (current.icon && current.icon !== nextIcon) void deleteIfUnused(current.icon).catch(() => undefined);
  if (current.cover && current.cover !== nextCover) void deleteIfUnused(current.cover).catch(() => undefined);

  return { ok: true, data: { id, type: data.type, slug: data.slug } };
}

export async function softDeleteEntry(id: string): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!current) return { ok: false, error: '条目不存在' };

  db.update(entries).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(entries.id, id)).run();

  revalidateEntryPaths({ type: current.type, slug: current.slug });
  revalidateSiteWide();
  return { ok: true, data: undefined };
}

export async function restoreEntry(id: string): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!current) return { ok: false, error: '条目不存在' };

  db.update(entries).set({ deletedAt: null, updatedAt: new Date() }).where(eq(entries.id, id)).run();

  revalidateEntryPaths({ type: current.type, slug: current.slug });
  revalidateSiteWide();
  return { ok: true, data: undefined };
}

/** 彻底删除：关联的子表靠外键 on delete cascade 一起清掉 */
export async function purgeEntry(id: string): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!current) return { ok: false, error: '条目不存在' };

  db.delete(entries).where(eq(entries.id, id)).run();

  revalidateEntryPaths({ type: current.type, slug: current.slug });
  revalidateSiteWide();
  return { ok: true, data: undefined };
}

export async function toggleFeatured(id: string): Promise<ActionResult<{ featured: boolean }>> {
  await requireAdmin();

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!current) return { ok: false, error: '条目不存在' };

  const next = !current.featured;
  db.update(entries).set({ featured: next, updatedAt: new Date() }).where(eq(entries.id, id)).run();

  revalidateEntryPaths({ type: current.type, slug: current.slug });
  return { ok: true, data: { featured: next } };
}

export async function setStatus(id: string, status: EntryStatus): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!current) return { ok: false, error: '条目不存在' };

  db.update(entries).set({ status, updatedAt: new Date() }).where(eq(entries.id, id)).run();

  revalidateEntryPaths({ type: current.type, slug: current.slug });
  revalidateSiteWide();
  return { ok: true, data: undefined };
}

/* ────────────────────────── 手动排序 ────────────────────────── */

/**
 * 上移 / 下移一位。
 *
 * 顺序存在 `entries.sort_weight`（越大越靠前），**全站一条队列**：工具、站点、店铺
 * 不再按类型分组，拖到哪就是哪。前台 /tools、/sites、/shops 只是从这条队列里各取一段。
 *
 * 为什么每次先整体重排：没调过的条目权重都是 0，两个 0 互换等于没动。
 * 所以先把整条队列按当前顺序写成 10 的倍数（顺序不变，只是变成互不相同的数），
 * 再交换目标与邻居，并且只写真正变化的行。
 * 不动 `updated_at` —— 调顺序不是内容改动，不该把「按更新时间」的列表搅乱。
 */
export async function moveEntry(
  id: string,
  direction: 'up' | 'down',
): Promise<ActionResult<{ name: string; position: number; total: number }>> {
  await requireAdmin();

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!current) return { ok: false, error: '条目不存在' };

  const siblings = db
    .select({ id: entries.id, sortWeight: entries.sortWeight })
    .from(entries)
    .where(isNull(entries.deletedAt))
    .orderBy(desc(entries.sortWeight), desc(entries.createdAt))
    .all();

  const index = siblings.findIndex((row) => row.id === id);
  if (index < 0) return { ok: false, error: '条目不存在' };

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0) return { ok: false, error: `「${current.name}」已经在最前面了` };
  if (target >= siblings.length) return { ok: false, error: `「${current.name}」已经在最后面了` };

  const ordered = [...siblings];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  const changes = ordered
    .map((row, position) => ({ id: row.id, weight: (ordered.length - position) * 10, before: row.sortWeight }))
    .filter((row) => row.before !== row.weight);

  db.transaction((tx) => {
    for (const row of changes) {
      tx.update(entries).set({ sortWeight: row.weight }).where(eq(entries.id, row.id)).run();
    }
  });

  revalidateSiteWide();

  return { ok: true, data: { name: current.name, position: target + 1, total: ordered.length } };
}

/**
 * 拖动排序：把 `id` 放到 `targetId` 的前面 / 后面。
 *
 * 和 moveEntry 共用同一套权重规则（越大越靠前、全站一条队列、整体重排），
 * **可以跨类型拖**：工具拖到站点前面是允许的，前台四个列表各取自己那一段。
 * 为什么按「相对谁」而不是「第几位」来传参：后台可能正带着筛选条件，
 * 界面上看到的行号跟真实名次对不上，用邻居定位就不会错位。
 */
export async function reorderEntry(
  id: string,
  targetId: string,
  place: 'before' | 'after',
): Promise<ActionResult<{ name: string; position: number; total: number; changed: boolean }>> {
  await requireAdmin();

  const current = db.select().from(entries).where(eq(entries.id, id)).get();
  const target = db.select().from(entries).where(eq(entries.id, targetId)).get();

  if (!current || !target) return { ok: false, error: '条目不存在' };

  const siblings = db
    .select({ id: entries.id, sortWeight: entries.sortWeight })
    .from(entries)
    .where(isNull(entries.deletedAt))
    .orderBy(desc(entries.sortWeight), desc(entries.createdAt))
    .all();

  const moving = siblings.find((row) => row.id === id);
  if (!moving) return { ok: false, error: '条目不存在' };

  const without = siblings.filter((row) => row.id !== id);
  const targetIndex = without.findIndex((row) => row.id === targetId);
  if (targetIndex < 0) return { ok: false, error: '条目不存在' };

  const insertAt = place === 'before' ? targetIndex : targetIndex + 1;
  const ordered = [...without.slice(0, insertAt), moving, ...without.slice(insertAt)];

  const sameOrder = ordered.every((row, position) => row.id === siblings[position]?.id);
  if (sameOrder) {
    return { ok: true, data: { name: current.name, position: insertAt + 1, total: ordered.length, changed: false } };
  }

  const changes = ordered
    .map((row, position) => ({ id: row.id, weight: (ordered.length - position) * 10, before: row.sortWeight }))
    .filter((row) => row.before !== row.weight);

  db.transaction((tx) => {
    for (const row of changes) {
      tx.update(entries).set({ sortWeight: row.weight }).where(eq(entries.id, row.id)).run();
    }
  });

  revalidateSiteWide();

  return { ok: true, data: { name: current.name, position: insertAt + 1, total: ordered.length, changed: true } };
}

/* ────────────────────────── 批量操作 ────────────────────────── */

function validateIds(ids: string[]): string[] {
  return ids.filter((id) => typeof id === 'string' && id.length > 0);
}

export async function bulkTag(
  ids: string[],
  dim: TagDim,
  tagIds: string[],
  mode: 'add' | 'remove' = 'add',
): Promise<ActionResult<{ affected: number }>> {
  await requireAdmin();

  const entryIds = validateIds(ids);
  if (entryIds.length === 0) return { ok: false, error: '没有选中任何条目' };
  if (tagIds.length === 0) return { ok: false, error: '没有选中任何标签' };

  db.transaction((tx) => {
    for (const entryId of entryIds) {
      if (mode === 'add') {
        for (const tagId of tagIds) {
          tx.insert(entryTags).values({ entryId, tagId }).onConflictDoNothing().run();
        }
      } else {
        for (const tagId of tagIds) {
          tx.delete(entryTags).where(and(eq(entryTags.entryId, entryId), eq(entryTags.tagId, tagId))).run();
        }
      }
    }

    for (const entryId of entryIds) {
      tx.update(entries).set({ updatedAt: new Date() }).where(eq(entries.id, entryId)).run();
    }
  });

  // 标签变了，相关条目的详情页和标签页都要刷
  const affected = db
    .select({ type: entries.type, slug: entries.slug })
    .from(entries)
    .where(inArray(entries.id, entryIds))
    .all();

  for (const entry of affected) {
    revalidateEntryPaths(entry);
  }
  revalidateSiteWide();

  return { ok: true, data: { affected: entryIds.length } };
}

export async function bulkSetStatus(ids: string[], status: EntryStatus): Promise<ActionResult<{ affected: number }>> {
  await requireAdmin();

  const entryIds = validateIds(ids);
  if (entryIds.length === 0) return { ok: false, error: '没有选中任何条目' };

  db.update(entries)
    .set({ status, updatedAt: new Date() })
    .where(inArray(entries.id, entryIds))
    .run();

  const affected = db
    .select({ type: entries.type, slug: entries.slug })
    .from(entries)
    .where(inArray(entries.id, entryIds))
    .all();

  for (const entry of affected) {
    revalidateEntryPaths(entry);
  }
  revalidateSiteWide();

  return { ok: true, data: { affected: entryIds.length } };
}

/** 批量软删除（回收站可以恢复） */
export async function bulkDelete(ids: string[]): Promise<ActionResult<{ affected: number }>> {
  await requireAdmin();

  const entryIds = validateIds(ids);
  if (entryIds.length === 0) return { ok: false, error: '没有选中任何条目' };

  const affected = db
    .select({ type: entries.type, slug: entries.slug })
    .from(entries)
    .where(inArray(entries.id, entryIds))
    .all();

  db.update(entries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(inArray(entries.id, entryIds))
    .run();

  for (const entry of affected) {
    revalidateEntryPaths(entry);
  }
  revalidateSiteWide();

  return { ok: true, data: { affected: entryIds.length } };
}

/** 回收站：彻底删除所有已软删除的条目 */
export async function purgeAllDeleted(): Promise<ActionResult<{ affected: number }>> {
  await requireAdmin();

  const rows = db.select({ id: entries.id }).from(entries).where(isNotNull(entries.deletedAt)).all();
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return { ok: true, data: { affected: 0 } };

  db.delete(entries).where(inArray(entries.id, ids)).run();

  revalidateSiteWide();
  return { ok: true, data: { affected: ids.length } };
}

/** 供列表页「全部页选择」用的 id 集合 */
export async function listEntryIds(filters: { type?: string; status?: string; keyword?: string }): Promise<string[]> {
  await requireAdmin();

  const conditions = [isNull(entries.deletedAt)];
  if (filters.type) conditions.push(eq(entries.type, filters.type));
  if (filters.status) conditions.push(eq(entries.status, filters.status));
  if (filters.keyword) {
    const keyword = filters.keyword.replace(/[%_]/g, '').trim();
    if (keyword) {
      conditions.push(sql`(${entries.name} like ${`%${keyword}%`} or ${entries.summary} like ${`%${keyword}%`})`);
    }
  }

  return db
    .select({ id: entries.id })
    .from(entries)
    .where(and(...conditions))
    .all()
    .map((row) => row.id);
}
