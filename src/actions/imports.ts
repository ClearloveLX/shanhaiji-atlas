'use server';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryBranches, entryTags, tags } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { revalidateSiteWide } from '@/lib/revalidate';
import { entryInputSchema } from '@/lib/validation';
import { isToolSlug } from '@/tools/registry';
import type { ActionResult } from '@/types';

/**
 * 导入导出。
 * 导出走 Server Action 返回字符串，由客户端下载成文件；导入先预检，确认后才写库。
 * ⚠️ 导出文件含全部条目（D9 起还会含私密内容），不要放公共网盘、不要提交进 Git。
 */

export type ExportEntry = {
  type: string;
  linkMode: string;
  slug: string;
  name: string;
  nameEn: string | null;
  summary: string;
  url: string | null;
  icon: string | null;
  cover: string | null;
  /** type=shop 可选：地图搜索词（连锁品牌不维护门店地址时靠它） */
  mapQuery: string | null;
  note: string | null;
  featured: boolean;
  status: string;
  sortWeight: number;
  tags: string[];
  branches: Array<{ name: string | null; address: string; city: string; district: string | null; phone: string | null; hours: string | null; lat: number | null; lng: number | null }>;
};

export async function exportAllJson(): Promise<ActionResult<{ json: string; count: number; filename: string }>> {
  await requireAdmin();

  const rows = db.select().from(entries).where(isNull(entries.deletedAt)).orderBy(entries.createdAt).all();

  const tagRows = db.select({ entryId: entryTags.entryId, dim: tags.dim, slug: tags.slug }).from(entryTags).innerJoin(tags, eq(tags.id, entryTags.tagId)).all();
  const tagMap = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagMap.get(row.entryId) ?? [];
    list.push(`${row.dim}/${row.slug}`);
    tagMap.set(row.entryId, list);
  }

  const branchRows = db.select().from(entryBranches).all();
  const branchMap = new Map<string, ExportEntry['branches']>();
  for (const branch of branchRows) {
    const list = branchMap.get(branch.entryId) ?? [];
    list.push({
      name: branch.name,
      address: branch.address,
      city: branch.city,
      district: branch.district,
      phone: branch.phone,
      hours: branch.hours,
      lat: branch.lat,
      lng: branch.lng,
    });
    branchMap.set(branch.entryId, list);
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    entries: rows.map<ExportEntry>((row) => ({
      type: row.type,
      linkMode: row.linkMode,
      slug: row.slug,
      name: row.name,
      nameEn: row.nameEn,
      summary: row.summary,
      url: row.url,
      icon: row.icon,
      cover: row.cover,
      mapQuery: row.mapQuery,
      note: row.note,
      featured: row.featured,
      status: row.status,
      sortWeight: row.sortWeight,
      tags: tagMap.get(row.id) ?? [],
      branches: branchMap.get(row.id) ?? [],
    })),
  };

  const today = new Date().toISOString().slice(0, 10);

  return {
    ok: true,
    data: { json: JSON.stringify(payload, null, 2), count: rows.length, filename: `atlas-export-${today}.json` },
  };
}

export async function exportAllCsv(): Promise<ActionResult<{ csv: string; count: number; filename: string }>> {
  await requireAdmin();

  const rows = db.select().from(entries).where(isNull(entries.deletedAt)).orderBy(entries.createdAt).all();

  const tagRows = db.select({ entryId: entryTags.entryId, dim: tags.dim, slug: tags.slug }).from(entryTags).innerJoin(tags, eq(tags.id, entryTags.tagId)).all();
  const tagMap = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagMap.get(row.entryId) ?? [];
    list.push(`${row.dim}/${row.slug}`);
    tagMap.set(row.entryId, list);
  }

  const header = ['type', 'link_mode', 'slug', 'name', 'name_en', 'summary', 'url', 'featured', 'status', 'tags'];
  const escape = (value: string | null) => `"${(value ?? '').replace(/"/g, '""')}"`;

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.type,
        row.linkMode,
        row.slug,
        escape(row.name),
        escape(row.nameEn),
        escape(row.summary),
        escape(row.url),
        String(row.featured),
        row.status,
        escape((tagMap.get(row.id) ?? []).join(' ')),
      ].join(','),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  // Excel 打开中文 CSV 需要 BOM
  return { ok: true, data: { csv: `\uFEFF${lines.join('\n')}`, count: rows.length, filename: `atlas-export-${today}.csv` } };
}

export type ImportPreviewItem = {
  slug: string;
  name: string;
  action: 'create' | 'update' | 'conflict';
  reason?: string;
};

export type ImportPreview = {
  items: ImportPreviewItem[];
  createCount: number;
  updateCount: number;
  conflictCount: number;
  invalidCount: number;
};

type RawImportEntry = Record<string, unknown>;

function parseImportPayload(raw: string): { entries: RawImportEntry[] } | { error: string } {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) return { entries: parsed as RawImportEntry[] };

    if (typeof parsed === 'object' && parsed !== null) {
      const candidate = parsed as { entries?: unknown };
      if (Array.isArray(candidate.entries)) return { entries: candidate.entries as RawImportEntry[] };
    }

    return { error: 'JSON 里没有找到 entries 数组' };
  } catch (error) {
    return { error: `JSON 解析失败：${error instanceof Error ? error.message : '未知错误'}` };
  }
}

/** 预检：只读，不改库，先告诉你会新增几条、更新几条、冲突几条 */
export async function previewImport(raw: string, onConflict: 'skip' | 'overwrite' | 'new-slug' = 'skip'): Promise<ActionResult<ImportPreview>> {
  await requireAdmin();

  const parsed = parseImportPayload(raw);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const items: ImportPreviewItem[] = [];
  let createCount = 0;
  let updateCount = 0;
  let conflictCount = 0;
  let invalidCount = 0;

  for (const rawEntry of parsed.entries) {
    const validated = entryInputSchema.safeParse(rawEntry);

    if (!validated.success) {
      invalidCount += 1;
      items.push({
        slug: String(rawEntry.slug ?? '（无 slug）'),
        name: String(rawEntry.name ?? '（无名称）'),
        action: 'conflict',
        reason: validated.error.issues[0]?.message ?? '字段不合法',
      });
      continue;
    }

    const data = validated.data;

    if (data.linkMode === 'internal' && !isToolSlug(data.tool?.component ?? '')) {
      invalidCount += 1;
      items.push({
        slug: data.slug,
        name: data.name,
        action: 'conflict',
        reason: `组件「${data.tool?.component ?? ''}」未注册`,
      });
      continue;
    }

    const existing = db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.type, data.type), eq(entries.slug, data.slug)))
      .get();

    if (existing) {
      if (onConflict === 'skip') {
        conflictCount += 1;
        items.push({ slug: data.slug, name: data.name, action: 'conflict', reason: 'slug 已存在，按「跳过」处理' });
      } else {
        updateCount += 1;
        items.push({ slug: data.slug, name: data.name, action: 'update' });
      }
      continue;
    }

    createCount += 1;
    items.push({ slug: data.slug, name: data.name, action: 'create' });
  }

  return {
    ok: true,
    data: { items: items.slice(0, 200), createCount, updateCount, conflictCount, invalidCount },
  };
}

export type ImportResult = { created: number; updated: number; skipped: number };

/** 真正写库。冲突策略：skip 跳过 / overwrite 覆盖 / new-slug 生成新 slug 后新增 */
export async function applyImport(
  raw: string,
  onConflict: 'skip' | 'overwrite' | 'new-slug' = 'skip',
): Promise<ActionResult<ImportResult>> {
  await requireAdmin();

  const parsed = parseImportPayload(raw);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (const rawEntry of parsed.entries) {
      const validated = entryInputSchema.safeParse(rawEntry);
      if (!validated.success) {
        skipped += 1;
        continue;
      }

      const data = validated.data;

      if (data.linkMode === 'internal' && !isToolSlug(data.tool?.component ?? '')) {
        skipped += 1;
        continue;
      }

      const existing = db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.type, data.type), eq(entries.slug, data.slug)))
        .get();

      let slug = data.slug;
      let targetId: string | null = null;

      if (existing) {
        if (onConflict === 'skip') {
          skipped += 1;
          continue;
        }
        if (onConflict === 'overwrite') {
          targetId = existing.id;
        }
        if (onConflict === 'new-slug') {
          slug = `${data.slug}-${Date.now().toString(36).slice(-4)}`;
        }
      }

      db.transaction((tx) => {
        if (targetId) {
          tx.update(entries)
            .set({
              type: data.type,
              linkMode: data.linkMode,
              slug,
              name: data.name,
              nameEn: data.nameEn ?? null,
              summary: data.summary,
              url: data.linkMode === 'external' ? (data.url ?? null) : null,
              icon: data.icon ?? null,
              cover: data.cover ?? null,
              mapQuery: data.type === 'shop' ? (data.mapQuery ?? null) : null,
              note: data.note ?? null,
              meta: data.meta,
              featured: data.featured,
              status: data.status,
              sortWeight: data.sortWeight,
              updatedAt: new Date(),
            })
            .where(eq(entries.id, targetId))
            .run();

          tx.delete(entryTags).where(eq(entryTags.entryId, targetId)).run();
        } else {
          const row = tx
            .insert(entries)
            .values({
              type: data.type,
              linkMode: data.linkMode,
              slug,
              name: data.name,
              nameEn: data.nameEn ?? null,
              summary: data.summary,
              url: data.linkMode === 'external' ? (data.url ?? null) : null,
              icon: data.icon ?? null,
              cover: data.cover ?? null,
              mapQuery: data.type === 'shop' ? (data.mapQuery ?? null) : null,
              note: data.note ?? null,
              meta: data.meta,
              featured: data.featured,
              status: data.status,
              sortWeight: data.sortWeight,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning({ id: entries.id })
            .get();

          targetId = row.id;
        }

        // 标签
        const dims = [
          { dim: 'topic' as const, slugs: data.tags.topic },
          { dim: 'scene' as const, slugs: data.tags.scene },
          { dim: 'attr' as const, slugs: data.tags.attr },
          { dim: 'platform' as const, slugs: data.tags.platform },
          { dim: 'price' as const, slugs: data.tags.price },
          { dim: 'quality' as const, slugs: data.tags.quality },
        ];

        for (const { dim, slugs } of dims) {
          for (const tagSlug of slugs) {
            const tag = tx
              .select({ id: tags.id })
              .from(tags)
              .where(and(eq(tags.dim, dim), eq(tags.slug, tagSlug)))
              .get();
            if (tag && targetId) {
              tx.insert(entryTags).values({ entryId: targetId, tagId: tag.id }).onConflictDoNothing().run();
            }
          }
        }

        // 门店（导入时整体替换）
        if (targetId) {
          tx.delete(entryBranches).where(eq(entryBranches.entryId, targetId)).run();
          if (data.linkMode === 'place') {
            data.branches.forEach((branch, index) => {
              tx.insert(entryBranches)
                .values({
                  entryId: targetId as string,
                  name: branch.name,
                  address: branch.address,
                  province: branch.province,
                  city: branch.city,
                  district: branch.district,
                  lat: branch.lat ?? null,
                  lng: branch.lng ?? null,
                  poiSource: branch.lat != null ? 'manual' : null,
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
        }
      });

      if (existing && onConflict === 'overwrite') updated += 1;
      else created += 1;
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '导入写入失败' };
  }

  revalidateSiteWide();
  return { ok: true, data: { created, updated, skipped } };
}

/** 导入前的回滚点：把当前全站数据导一份到 data/backups/（运行时目录，部署不会覆盖） */
export async function snapshotBeforeImport(): Promise<ActionResult<{ path: string; count: number }>> {
  await requireAdmin();

  const exported = await exportAllJson();
  if (!exported.ok) return exported;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? './data/uploads', '..', 'backups');
  const filename = `atlas-before-import-${stamp}.json`;

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), exported.data.json, 'utf8');
  } catch (error) {
    return { ok: false, error: `写回滚点失败：${error instanceof Error ? error.message : '未知错误'}` };
  }

  return { ok: true, data: { path: path.join(dir, filename), count: exported.data.count } };
}
