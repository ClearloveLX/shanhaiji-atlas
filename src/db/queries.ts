import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, gte, inArray, isNull, like, ne, or, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db } from '@/db';
import {
  clickLogs,
  entries,
  entryBranches,
  entryPrivate,
  entryQrcodes,
  entryTags,
  entryTools,
  linkChecks,
  pageViewDaily,
  settings,
  submissions,
  tags,
  visitDaily,
  type Entry,
  type EntryBranch,
  type EntryPrivate,
  type EntryQrcode,
  type EntryTool,
  type Submission,
  type Tag,
} from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { dayKey, dayKeyAgo } from '@/lib/clicks';

/**
 * 读查询层 —— 页面组件里不出现 db.select()，全部走这里。
 *
 * ★★ 这里只有两套 API，没有第三套（docs/PRIVACY.md 铁律 2）★★
 *
 *   公开组 getPublic*
 *     - 硬编码 visibility = 'public'，**不接受外部传参**，外部绕不过去
 *     - 一律用 unstable_cache + cacheTag('entries' / 'tags')
 *     - 关联标签时排除 dim = 'private'，私密标签绝不能出现在公开筛选栏
 *
 *   后台组 getAdmin*
 *     - 第一行必须 await requireAdmin()
 *     - **一律不加 unstable_cache**（站长一个人用，加了反而危险）
 *
 * 新增查询函数时，先问自己属于哪一组；两组都不属于的函数不要写进来。
 *
 * ⚠️ 日期字段：unstable_cache 的值会被 JSON 序列化，落盘缓存再读出来时
 *   createdAt / updatedAt 会变成 ISO 字符串。取用一律走 src/lib/utils.ts 的
 *   formatDate / formatRelative / toDate，不要直接调 .getTime()。
 */

export const CACHE_TAG_ENTRIES = 'entries';
export const CACHE_TAG_TAGS = 'tags';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * 缓存包装。
 * 平时就是 unstable_cache；测试脚本里打开 ATLAS_DISABLE_CACHE=1 时直通，
 * 这样在 Next 运行环境之外（tsx 跑 tests/）也能直接调这些查询函数。
 */
function withCache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { tags: string[] },
): (...args: Args) => Promise<Result> {
  if (process.env.ATLAS_DISABLE_CACHE === '1') return fn;
  // revalidate: 300 是安全网：即使某次写库漏了 revalidateTag，最多 5 分钟后前台也会自己更新
  return unstable_cache(fn, keyParts, { ...options, revalidate: 300 });
}

/* ────────────────────────── 类型 ────────────────────────── */

export type EntrySort = 'newest' | 'updated' | 'name' | 'featured' | 'manual';

/**
 * 多标签之间的匹配方式：
 * - `all` 强关联：每个选中的标签都要命中（AND）
 * - `any` 弱关联：命中任意一个就出现（OR）
 *
 * 查询层默认 `any`，是**为了不改后台既有的筛选行为**；
 * 公开列表页由 `parseListQuery` 显式传 `all`（见 src/lib/list-params.ts）。
 */
export type TagMatchMode = 'all' | 'any';

export type EntryQuery = {
  type?: string;
  status?: string;
  linkMode?: string;
  visibility?: string;
  keyword?: string;
  featured?: boolean;
  /** 复合形式：'scene/work' */
  tagKeys?: string[];
  /** 多个 tagKeys 之间怎么组合，默认 any */
  tagMatch?: TagMatchMode;
  sort?: EntrySort;
  /** 排序方向，默认 desc */
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  /** 后台列表要看到软删除的记录时打开 */
  includeDeleted?: boolean;
  /** 回收站：只看已删除的 */
  deletedOnly?: boolean;
};

export type EntryWithTags = Entry & { tags: Tag[] };

export type EntryDetail = Entry & {
  tags: Tag[];
  branches: EntryBranch[];
  qrcodes: EntryQrcode[];
  tool: EntryTool | null;
};

/** 后台编辑页用：额外带私密信息 */
export type AdminEntryDetail = EntryDetail & { privateProfile: EntryPrivate | null };

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type TagWithCount = Tag & { count: number };

export type DashboardStats = {
  total: number;
  addedThisMonth: number;
  pendingSubmissions: number;
  staleCount: number;
  /** 今日访客（按天去重）与今日浏览（PV），见 docs/DATA-MODEL.md 4.5 */
  todayVisitors: number;
  todayViews: number;
};

/* ────────────────────────── 访问统计 ────────────────────────── */

export type TrafficDay = { day: string; visitors: number; views: number };
export type TrafficPageRow = { path: string; kind: string; views: number; entryId: string | null };
export type TrafficEntryRow = { id: string; name: string; type: string; views: number };
export type TrafficRefRow = { host: string; views: number };

export type TrafficStats = {
  today: { visitors: number; views: number };
  yesterday: { visitors: number; views: number };
  /** 近 7 / 30 天的浏览总量 */
  viewsLast7: number;
  viewsLast30: number;
  /** 近 7 / 30 天的访客数：按天去重后相加（跨天无法去重，见下方注释） */
  visitorsLast7: number;
  visitorsLast30: number;
  totalViews: number;
  /** 近 14 天（含今天），没有数据的天补 0 */
  trend: TrafficDay[];
  rangeDays: number;
  topPages: TrafficPageRow[];
  topEntries: TrafficEntryRow[];
  topRefs: TrafficRefRow[];
};

export type TypeCount = { type: string; count: number };

export type LinkFailureRow = {
  entryId: string;
  entryName: string;
  entryType: string;
  statusCode: number | null;
  error: string | null;
  checkedAt: Date;
};

/* ────────────────────────── 内部工具 ────────────────────────── */

/** 关键字里的 LIKE 通配符直接抹掉，避免用户输入 % 把整表捞出来 */
function normalizeKeyword(keyword: string): string {
  return keyword.replace(/[%_]/g, '').trim();
}

function buildEntryConditions(query: EntryQuery, visibility: string | null): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (query.deletedOnly) {
    conditions.push(sql`${entries.deletedAt} is not null`);
  } else if (!query.includeDeleted) {
    conditions.push(isNull(entries.deletedAt));
  }

  // ★ 公开组写死 public，外部传什么都改不了；后台组才允许按可见性筛
  if (visibility) conditions.push(eq(entries.visibility, visibility));
  else if (query.visibility) conditions.push(eq(entries.visibility, query.visibility));

  if (query.type) conditions.push(eq(entries.type, query.type));
  if (query.status) conditions.push(eq(entries.status, query.status));
  if (query.linkMode) conditions.push(eq(entries.linkMode, query.linkMode));
  if (typeof query.featured === 'boolean') conditions.push(eq(entries.featured, query.featured));

  const keyword = query.keyword ? normalizeKeyword(query.keyword) : '';
  if (keyword) {
    const pattern = `%${keyword}%`;
    const keywordCondition = or(
      like(entries.name, pattern),
      like(entries.nameEn, pattern),
      like(entries.summary, pattern),
      like(entries.url, pattern),
    );
    if (keywordCondition) conditions.push(keywordCondition);
  }

  const tagKeys = query.tagKeys?.filter(Boolean) ?? [];
  if (tagKeys.length > 0) {
    const pairs = tagKeys.map((key) => {
      const [dim, slug] = key.split('/');
      return { dim, slug };
    });

    const existsFor = (pair: { dim: string; slug: string }) =>
      sql`exists (select 1 from ${entryTags} inner join ${tags} on ${tags.id} = ${entryTags.tagId}
          where ${entryTags.entryId} = ${entries.id} and ${tags.dim} = ${pair.dim} and ${tags.slug} = ${pair.slug})`;

    if (query.tagMatch === 'all') {
      // 强关联：逐个 push，SQL 里就是 AND —— 少一个标签都不出现
      for (const pair of pairs) conditions.push(existsFor(pair));
    } else {
      // 弱关联：命中任意一个即可
      const tagCondition = or(...pairs.map(existsFor));
      if (tagCondition) conditions.push(tagCondition);
    }
  }

  return conditions;
}

/**
 * **权威顺序**：站长在后台拖出来 / ↑↓ 调出来的那一份，全站只有这一套定义。
 *
 * 所有类型混在**同一条队列**里（工具、站点、源码、好店不分组），`sort_weight` 越大越靠前；
 * 没调过的都是 0，退回按收录时间排，所以不调就和以前一样。
 * 后台列表、前台四个列表、搜索结果、以及首页「编辑精选」全都走这里 ——
 * 分类页（/tools、/sites、/codes、/shops）只是从这条队列里各取自己那一段。
 */
function manualOrder() {
  return [desc(entries.sortWeight), desc(entries.createdAt)];
}

function orderByFor(sort: EntrySort | undefined, dir: 'asc' | 'desc' = 'desc') {
  const order = dir === 'asc' ? asc : desc;

  switch (sort) {
    case 'name':
      return [order(entries.name)];
    case 'featured':
      // 精选优先：精选的排前面，组内仍然是权威顺序
      return [desc(entries.featured), ...manualOrder()];
    case 'updated':
      return [order(entries.updatedAt)];
    case 'newest':
      return [order(entries.createdAt)];
    case 'manual':
    default:
      return manualOrder();
  }
}

/** 关联标签；公开组要排除 dim='private'，否则「私藏」会出现在公开筛选栏 */
function attachTags(rows: Entry[], includePrivateDim = false): EntryWithTags[] {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const conditions = [inArray(entryTags.entryId, ids)];
  if (!includePrivateDim) conditions.push(sql`${tags.dim} <> 'private'`);

  const tagRows = db
    .select({ entryId: entryTags.entryId, tag: tags })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(and(...conditions))
    .orderBy(asc(tags.dim), asc(tags.sort))
    .all();

  const grouped = new Map<string, Tag[]>();
  for (const row of tagRows) {
    const list = grouped.get(row.entryId) ?? [];
    list.push(row.tag);
    grouped.set(row.entryId, list);
  }

  return rows.map((row) => ({ ...row, tags: grouped.get(row.id) ?? [] }));
}

async function loadEntryDetail(where: SQL<unknown> | undefined, includePrivateDim: boolean): Promise<EntryDetail | null> {
  const entry = db.select().from(entries).where(where).get();
  if (!entry) return null;

  const tagConditions = [eq(entryTags.entryId, entry.id)];
  if (!includePrivateDim) tagConditions.push(sql`${tags.dim} <> 'private'`);

  const tagRows = db
    .select({ tag: tags })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(and(...tagConditions))
    .orderBy(asc(tags.dim), asc(tags.sort))
    .all();

  const branches = db
    .select()
    .from(entryBranches)
    .where(eq(entryBranches.entryId, entry.id))
    .orderBy(asc(entryBranches.sort))
    .all();

  const qrcodes = db
    .select()
    .from(entryQrcodes)
    .where(eq(entryQrcodes.entryId, entry.id))
    .orderBy(asc(entryQrcodes.sort))
    .all();

  const tool = db.select().from(entryTools).where(eq(entryTools.entryId, entry.id)).get() ?? null;

  return { ...entry, tags: tagRows.map((row) => row.tag), branches, qrcodes, tool };
}

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/* ══════════════════════════ 公开组 getPublic* ══════════════════════════ */

const listPublicEntries = withCache(
  async (query: EntryQuery): Promise<Paged<EntryWithTags>> => {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
    const conditions = buildEntryConditions(query, 'public');
    const where = and(...conditions);

    const totalRow = db.select({ count: sql<number>`count(*)` }).from(entries).where(where).get();
    const total = totalRow?.count ?? 0;

    const rows = db
      .select()
      .from(entries)
      .where(where)
      .orderBy(...orderByFor(query.sort, query.dir))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    return paginate(attachTags(rows), total, page, pageSize);
  },
  ['public-entries'],
  { tags: [CACHE_TAG_ENTRIES] },
);

/** 公开条目列表：只返回 visibility='public'，站长登录与否结果完全一样 */
export function getPublicEntries(query: EntryQuery = {}): Promise<Paged<EntryWithTags>> {
  return listPublicEntries(query);
}

const getPublicEntry = withCache(
  async (type: string, slug: string): Promise<EntryDetail | null> =>
    loadEntryDetail(and(eq(entries.type, type), eq(entries.slug, slug), isNull(entries.deletedAt), eq(entries.visibility, 'public')), false),
  ['public-entry-by-slug'],
  { tags: [CACHE_TAG_ENTRIES, CACHE_TAG_TAGS] },
);

/** 公开详情：查不到（含私密条目）一律返回 null，页面里 notFound() 出 404 */
export function getPublicEntryBySlug(type: string, slug: string): Promise<EntryDetail | null> {
  return getPublicEntry(type, slug);
}

const getPublicFeaturedCached = withCache(
  async (limit: number): Promise<EntryWithTags[]> => {
    const rows = db
      .select()
      .from(entries)
      .where(and(isNull(entries.deletedAt), eq(entries.visibility, 'public'), eq(entries.featured, true)))
      // 精选区 = 权威顺序里筛出精选那几条，所以顺序和后台默认列表完全一致
      .orderBy(...manualOrder())
      .limit(limit)
      .all();
    return attachTags(rows);
  },
  ['public-featured'],
  { tags: [CACHE_TAG_ENTRIES] },
);

export function getPublicFeatured(limit = 6): Promise<EntryWithTags[]> {
  return getPublicFeaturedCached(limit);
}

const getPublicLatestCached = withCache(
  async (limit: number): Promise<EntryWithTags[]> => {
    const rows = db
      .select()
      .from(entries)
      .where(and(isNull(entries.deletedAt), eq(entries.visibility, 'public')))
      .orderBy(desc(entries.createdAt))
      .limit(limit)
      .all();
    return attachTags(rows);
  },
  ['public-latest'],
  { tags: [CACHE_TAG_ENTRIES] },
);

export function getPublicLatest(limit = 12): Promise<EntryWithTags[]> {
  return getPublicLatestCached(limit);
}

const getPublicSitemapEntriesCached = withCache(
  async (): Promise<Array<Pick<Entry, 'type' | 'slug' | 'updatedAt'>>> =>
    db
      .select({ type: entries.type, slug: entries.slug, updatedAt: entries.updatedAt })
      .from(entries)
      .where(and(isNull(entries.deletedAt), eq(entries.visibility, 'public'), sql`${entries.status} <> 'dead'`))
      .orderBy(desc(entries.updatedAt))
      .all(),
  ['public-sitemap-entries'],
  { tags: [CACHE_TAG_ENTRIES] },
);

export function getPublicEntriesForSitemap(): Promise<Array<Pick<Entry, 'type' | 'slug' | 'updatedAt'>>> {
  return getPublicSitemapEntriesCached();
}

const getPublicTypeCountsCached = withCache(
  async (): Promise<TypeCount[]> =>
    db
      .select({ type: entries.type, count: sql<number>`count(*)` })
      .from(entries)
      .where(and(isNull(entries.deletedAt), eq(entries.visibility, 'public')))
      .groupBy(entries.type)
      .all(),
  ['public-type-counts'],
  { tags: [CACHE_TAG_ENTRIES] },
);

export function getPublicTypeCounts(): Promise<TypeCount[]> {
  return getPublicTypeCountsCached();
}

/**
 * 标签树 + 计数。
 * ★ 公开的计数只统计 public 条目，否则点进去条数对不上，还暗示了有隐藏内容。
 */
const getPublicTagTreeCached = withCache(
  async (): Promise<TagWithCount[]> => {
    const rows = db
      .select({ tag: tags, count: sql<number>`count(${entries.id})` })
      .from(tags)
      .leftJoin(entryTags, eq(entryTags.tagId, tags.id))
      .leftJoin(
        entries,
        and(eq(entries.id, entryTags.entryId), isNull(entries.deletedAt), eq(entries.visibility, 'public')),
      )
      .where(sql`${tags.dim} <> 'private'`)
      .groupBy(tags.id)
      .orderBy(asc(tags.dim), asc(tags.sort))
      .all();

    return rows.map((row) => ({ ...row.tag, count: row.count }));
  },
  ['public-tag-tree'],
  { tags: [CACHE_TAG_TAGS, CACHE_TAG_ENTRIES] },
);

export function getPublicTagTree(): Promise<TagWithCount[]> {
  return getPublicTagTreeCached();
}

const getPublicTagsByDimCached = withCache(
  async (dim: string): Promise<Tag[]> =>
    db
      .select()
      .from(tags)
      .where(and(eq(tags.dim, dim), sql`${tags.dim} <> 'private'`))
      .orderBy(asc(tags.sort))
      .all(),
  ['public-tags-by-dim'],
  { tags: [CACHE_TAG_TAGS] },
);

export function getPublicTagsByDim(dim: string): Promise<Tag[]> {
  return getPublicTagsByDimCached(dim);
}

const getPublicTagCountsByTypeCached = withCache(
  async (type: string | null): Promise<TagWithCount[]> => {
    const rows = db
      .select({ tag: tags, count: sql<number>`count(${entries.id})` })
      .from(tags)
      .leftJoin(entryTags, eq(entryTags.tagId, tags.id))
      .leftJoin(
        entries,
        and(
          eq(entries.id, entryTags.entryId),
          isNull(entries.deletedAt),
          eq(entries.visibility, 'public'),
          type ? eq(entries.type, type) : sql`1 = 1`,
        ),
      )
      .where(sql`${tags.dim} <> 'private'`)
      .groupBy(tags.id)
      .orderBy(asc(tags.dim), asc(tags.sort))
      .all();

    return rows.map((row) => ({ ...row.tag, count: row.count }));
  },
  ['public-tag-counts-by-type'],
  { tags: [CACHE_TAG_TAGS, CACHE_TAG_ENTRIES] },
);

export function getPublicTagCountsByType(type: string | null = null): Promise<TagWithCount[]> {
  return getPublicTagCountsByTypeCached(type);
}

const getPublicEntriesByTagCached = withCache(
  async (dim: string, slug: string, limit: number): Promise<EntryWithTags[]> => {
    const rows = db
      .select()
      .from(entries)
      .where(
        and(
          isNull(entries.deletedAt),
          eq(entries.visibility, 'public'),
          sql`exists (select 1 from ${entryTags} inner join ${tags} on ${tags.id} = ${entryTags.tagId}
              where ${entryTags.entryId} = ${entries.id} and ${tags.dim} = ${dim} and ${tags.slug} = ${slug})`,
        ),
      )
      .orderBy(desc(entries.createdAt))
      .limit(limit)
      .all();

    return attachTags(rows);
  },
  ['public-entries-by-tag'],
  { tags: [CACHE_TAG_ENTRIES, CACHE_TAG_TAGS] },
);

export function getPublicEntriesByTag(dim: string, slug: string, limit = 10): Promise<EntryWithTags[]> {
  return getPublicEntriesByTagCached(dim, slug, limit);
}

export type SearchHit = EntryWithTags & { score: number };

/**
 * 站内搜索：SQLite 的 LIKE '%关键词%'。
 * 条目量在几千以内时完全够快（几毫秒），**不要上 FTS5，更不要用 pg_trgm（那是 Postgres 的）**。
 * 权重：名称命中 > 简介命中 > 链接命中 > 标签命中，且只搜 public。
 */
const searchPublicEntriesCached = withCache(
  async (keyword: string, limit: number): Promise<SearchHit[]> => {
    const normalized = normalizeKeyword(keyword);
    if (!normalized) return [];

    const pattern = `%${normalized}%`;

    const score = sql<number>`(
      (case when ${entries.name} like ${pattern} then 3 else 0 end) +
      (case when ${entries.nameEn} like ${pattern} then 3 else 0 end) +
      (case when ${entries.summary} like ${pattern} then 2 else 0 end) +
      (case when ${entries.url} like ${pattern} then 1 else 0 end) +
      (case when exists (
        select 1 from ${entryTags} inner join ${tags} on ${tags.id} = ${entryTags.tagId}
        where ${entryTags.entryId} = ${entries.id} and ${tags.dim} <> 'private' and ${tags.name} like ${pattern}
      ) then 1 else 0 end)
    )`;

    const rows = db
      .select({ entry: entries, score })
      .from(entries)
      .where(
        and(
          isNull(entries.deletedAt),
          eq(entries.visibility, 'public'),
          sql`${entries.name} like ${pattern} or ${entries.nameEn} like ${pattern} or ${entries.summary} like ${pattern} or ${entries.url} like ${pattern} or exists (
            select 1 from ${entryTags} inner join ${tags} on ${tags.id} = ${entryTags.tagId}
            where ${entryTags.entryId} = ${entries.id} and ${tags.dim} <> 'private' and ${tags.name} like ${pattern}
          )`,
        ),
      )
      .orderBy(desc(score), desc(entries.featured), desc(entries.createdAt))
      .limit(limit)
      .all();

    return attachTags(rows.map((row) => row.entry)).map((entry, index) => ({ ...entry, score: rows[index]?.score ?? 0 }));
  },
  ['public-search-entries'],
  { tags: [CACHE_TAG_ENTRIES, CACHE_TAG_TAGS] },
);

export function searchPublicEntries(keyword: string, limit = 60): Promise<SearchHit[]> {
  return searchPublicEntriesCached(keyword, limit);
}

const getPublicPrimaryCitiesCached = withCache(
  async (ids: string[]): Promise<Array<{ entryId: string; city: string }>> => {
    if (ids.length === 0) return [];

    return db
      .select({ entryId: entryBranches.entryId, city: entryBranches.city })
      .from(entryBranches)
      .innerJoin(entries, eq(entries.id, entryBranches.entryId))
      .where(and(inArray(entryBranches.entryId, ids), eq(entryBranches.status, 'active'), eq(entries.visibility, 'public')))
      .orderBy(desc(entryBranches.isPrimary), asc(entryBranches.sort))
      .all();
  },
  ['public-primary-cities'],
  { tags: [CACHE_TAG_ENTRIES] },
);

export async function getPublicPrimaryCityMap(ids: string[]): Promise<Record<string, string | null>> {
  const rows = await getPublicPrimaryCitiesCached(ids);
  const map: Record<string, string | null> = {};
  for (const row of rows) {
    if (!map[row.entryId]) map[row.entryId] = row.city;
  }
  return map;
}

export type BranchBoardRow = {
  id: string;
  entryId: string;
  entryName: string;
  entrySlug: string;
  entryType: string;
  name: string | null;
  address: string;
  city: string;
  district: string | null;
  phone: string | null;
  hours: string | null;
  priceLevel: number | null;
  lat: number | null;
  lng: number | null;
  isPrimary: boolean;
  status: string;
  sort: number;
};

function selectBranchColumns(visibility: string | null) {
  return db
    .select({
      id: entryBranches.id,
      entryId: entries.id,
      entryName: entries.name,
      entrySlug: entries.slug,
      entryType: entries.type,
      name: entryBranches.name,
      address: entryBranches.address,
      city: entryBranches.city,
      district: entryBranches.district,
      phone: entryBranches.phone,
      hours: entryBranches.hours,
      priceLevel: entryBranches.priceLevel,
      lat: entryBranches.lat,
      lng: entryBranches.lng,
      isPrimary: entryBranches.isPrimary,
      status: entryBranches.status,
      sort: entryBranches.sort,
    })
    .from(entryBranches)
    .innerJoin(entries, eq(entries.id, entryBranches.entryId))
    .where(
      visibility
        ? and(isNull(entries.deletedAt), eq(entries.visibility, visibility))
        : isNull(entries.deletedAt),
    )
    .orderBy(asc(entryBranches.city), desc(entryBranches.isPrimary), asc(entryBranches.sort));
}

const getPublicPlaceBranchesCached = withCache(
  async (): Promise<BranchBoardRow[]> => selectBranchColumns('public').all(),
  ['public-place-branches'],
  { tags: [CACHE_TAG_ENTRIES] },
);

/** 好店地图用：公开的线下门店 */
export async function getPublicPlaceBranches(): Promise<BranchBoardRow[]> {
  return getPublicPlaceBranchesCached();
}

/** 「我在这附近」：bounding box 粗筛 + 哈弗辛精排，**不要上 PostGIS** */
export async function findPublicNearbyBranches(
  lat: number,
  lng: number,
  limit = 20,
): Promise<Array<BranchBoardRow & { distanceKm: number }>> {
  const all = await getPublicPlaceBranchesCached();
  const degree = 0.45; // ≈50km
  const rad = Math.PI / 180;

  return all
    .filter(
      (branch) =>
        branch.status === 'active' &&
        typeof branch.lat === 'number' &&
        typeof branch.lng === 'number' &&
        Math.abs(branch.lat - lat) <= degree &&
        Math.abs(branch.lng - lng) <= degree,
    )
    .map((branch) => {
      const branchLat = branch.lat as number;
      const branchLng = branch.lng as number;
      const distanceKm =
        6371 *
        Math.acos(
          Math.cos(lat * rad) * Math.cos(branchLat * rad) * Math.cos(branchLng * rad - lng * rad) +
            Math.sin(lat * rad) * Math.sin(branchLat * rad),
        );
      return { ...branch, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/** /go/{slug} 用：只能拿到 public 条目（私密条目的跳转在路由里另外鉴权） */
const getPublicRedirectEntryCached = withCache(
  async (slug: string): Promise<Entry | null> =>
    db
      .select()
      .from(entries)
      .where(and(eq(entries.slug, slug), isNull(entries.deletedAt), sql`${entries.visibility} <> 'private'`))
      .get() ?? null,
  ['public-redirect-entry'],
  { tags: [CACHE_TAG_ENTRIES] },
);

export function getPublicRedirectEntry(slug: string): Promise<Entry | null> {
  return getPublicRedirectEntryCached(slug);
}

/** 私密条目的跳转用（调用方必须先 requireAdmin） */
export function getPrivateRedirectEntry(slug: string): Entry | null {
  return (
    db
      .select()
      .from(entries)
      .where(and(eq(entries.slug, slug), isNull(entries.deletedAt), eq(entries.visibility, 'private')))
      .get() ?? null
  );
}

export type PublicQrcode = {
  id: string;
  label: string;
  kind: string;
  image: string;
  tip: string | null;
  expiresAt: Date | null;
  sort: number;
};

/** 详情页展示用的二维码：只给启用中、未过期的 */
export function getActiveQrcodes(entryId: string): PublicQrcode[] {
  const now = new Date();
  return db
    .select({
      id: entryQrcodes.id,
      label: entryQrcodes.label,
      kind: entryQrcodes.kind,
      image: entryQrcodes.image,
      tip: entryQrcodes.tip,
      expiresAt: entryQrcodes.expiresAt,
      sort: entryQrcodes.sort,
    })
    .from(entryQrcodes)
    .where(and(eq(entryQrcodes.entryId, entryId), eq(entryQrcodes.isActive, true)))
    .orderBy(asc(entryQrcodes.sort))
    .all()
    .filter((qrcode) => !qrcode.expiresAt || new Date(qrcode.expiresAt).getTime() > now.getTime());
}

/* ══════════════════════════ 后台组 getAdmin* ══════════════════════════ */

export async function getAdminEntries(query: EntryQuery = {}): Promise<Paged<EntryWithTags>> {
  await requireAdmin();

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const conditions = buildEntryConditions(query, null);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = db.select({ count: sql<number>`count(*)` }).from(entries).where(where).get();
  const total = totalRow?.count ?? 0;

  // 手动排序 = 权威顺序（全站一条队列，正好也覆盖了 getAdminEntryPositions 的名次）
  const orderBy = orderByFor(query.sort, query.dir);

  const rows = db
    .select()
    .from(entries)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return paginate(attachTags(rows, true), total, page, pageSize);
}

export async function getAdminEntryById(id: string): Promise<AdminEntryDetail | null> {
  await requireAdmin();

  const detail = await loadEntryDetail(eq(entries.id, id), true);
  if (!detail) return null;

  const privateProfile = db.select().from(entryPrivate).where(eq(entryPrivate.entryId, id)).get() ?? null;

  return { ...detail, privateProfile };
}

export async function getAdminEntryBySlug(type: string, slug: string): Promise<AdminEntryDetail | null> {
  await requireAdmin();

  const detail = await loadEntryDetail(and(eq(entries.type, type), eq(entries.slug, slug)), true);
  if (!detail) return null;

  const privateProfile = db.select().from(entryPrivate).where(eq(entryPrivate.entryId, detail.id)).get() ?? null;

  return { ...detail, privateProfile };
}

/**
 * 手动排序视图用：每个公开条目在**整条手动顺序里排第几位**（顺带给出总数）。
 *
 * 所有类型混在一起数，不分工具 / 站点 / 源码 / 好店 —— 前台四个列表各自看到的是这一条
 * 队列的一段，所以数字在分类页里也是连续的（比如只有站点时才显示 3、7、8）。
 *
 * 为什么用窗口函数一次算完、而不是在前端按当前页数出来：
 * 分页后第二页会从 1 重新数，数字就错了。这里算的是全站名次，**跟后台的筛选条件无关**，
 * 所以只排掉软删除和非公开条目（隐藏条目不进前台，就没有名次），不加任何筛选。
 */
export async function getAdminEntryPositions(): Promise<Record<string, { position: number; total: number }>> {
  await requireAdmin();

  const rows = db.all<{ id: string; rn: number; cnt: number }>(sql`
    select id,
           row_number() over (order by sort_weight desc, created_at desc) as rn,
           count(*) over () as cnt
    from ${entries}
    where deleted_at is null and visibility = 'public'
  `);

  const positions: Record<string, { position: number; total: number }> = {};
  for (const row of rows) positions[row.id] = { position: row.rn, total: row.cnt };
  return positions;
}

export async function getAdminTagTree(): Promise<TagWithCount[]> {
  await requireAdmin();

  const rows = db
    .select({ tag: tags, count: sql<number>`count(${entries.id})` })
    .from(tags)
    .leftJoin(entryTags, eq(entryTags.tagId, tags.id))
    .leftJoin(entries, and(eq(entries.id, entryTags.entryId), isNull(entries.deletedAt)))
    .groupBy(tags.id)
    .orderBy(asc(tags.dim), asc(tags.sort))
    .all();

  return rows.map((row) => ({ ...row.tag, count: row.count }));
}

export async function getAdminAllTags(): Promise<Tag[]> {
  await requireAdmin();
  return db.select().from(tags).orderBy(asc(tags.dim), asc(tags.sort)).all();
}

export type TagEntryIndexRow = {
  tagId: string;
  entryId: string;
  name: string;
  type: string;
};

export async function getAdminTagEntryIndex(): Promise<TagEntryIndexRow[]> {
  await requireAdmin();

  return db
    .select({ tagId: entryTags.tagId, entryId: entries.id, name: entries.name, type: entries.type })
    .from(entryTags)
    .innerJoin(entries, eq(entries.id, entryTags.entryId))
    .where(isNull(entries.deletedAt))
    .orderBy(desc(entries.createdAt))
    .all();
}

export async function getAdminDashboardStats(): Promise<DashboardStats> {
  await requireAdmin();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const total = db.select({ count: sql<number>`count(*)` }).from(entries).where(isNull(entries.deletedAt)).get();
  const addedThisMonth = db
    .select({ count: sql<number>`count(*)` })
    .from(entries)
    .where(and(isNull(entries.deletedAt), gte(entries.createdAt, monthStart)))
    .get();
  const pending = db
    .select({ count: sql<number>`count(*)` })
    .from(submissions)
    .where(eq(submissions.status, 'pending'))
    .get();
  const stale = db
    .select({ count: sql<number>`count(*)` })
    .from(entries)
    .where(and(isNull(entries.deletedAt), eq(entries.status, 'stale')))
    .get();

  const today = dayKey();
  const todayVisitors =
    db.select({ count: sql<number>`count(*)` }).from(visitDaily).where(eq(visitDaily.day, today)).get()?.count ?? 0;
  const todayViews =
    db
      .select({ views: sql<number>`coalesce(sum(${pageViewDaily.views}), 0)` })
      .from(pageViewDaily)
      .where(eq(pageViewDaily.day, today))
      .get()?.views ?? 0;

  return {
    total: total?.count ?? 0,
    addedThisMonth: addedThisMonth?.count ?? 0,
    pendingSubmissions: pending?.count ?? 0,
    staleCount: stale?.count ?? 0,
    todayVisitors,
    todayViews,
  };
}

/* ────────────────────────── 访问统计（后台） ────────────────────────── */

const TRAFFIC_TREND_DAYS = 14;

/**
 * 访问统计。规则和写入路径见 docs/DATA-MODEL.md 4.5。
 *
 * ⚠️ 跨天去重是**故意做不到**的：访客摘要每天换盐（见 lib/analytics.ts），
 * 所以「近 7 天访客」是「每天去重后相加」，同一个人连来 3 天会算 3 次。
 * 页面上必须把这层意思写清楚，不要让人误以为是 7 天内的独立访客。
 */
export async function getAdminTrafficStats(rangeDays = 7): Promise<TrafficStats> {
  await requireAdmin();

  const days = rangeDays === 30 ? 30 : 7;
  const today = dayKey();
  const yesterday = dayKeyAgo(1);
  const since7 = dayKeyAgo(6);
  const since30 = dayKeyAgo(29);
  const sinceRange = dayKeyAgo(days - 1);

  const visitRows = db
    .select({
      day: visitDaily.day,
      visitors: sql<number>`count(*)`,
      views: sql<number>`coalesce(sum(${visitDaily.views}), 0)`,
    })
    .from(visitDaily)
    .where(gte(visitDaily.day, since30))
    .groupBy(visitDaily.day)
    .all();

  const viewRows = db
    .select({ day: pageViewDaily.day, views: sql<number>`coalesce(sum(${pageViewDaily.views}), 0)` })
    .from(pageViewDaily)
    .where(gte(pageViewDaily.day, since30))
    .groupBy(pageViewDaily.day)
    .all();

  const visitsByDay = new Map(visitRows.map((row) => [row.day, row]));
  const viewsByDay = new Map(viewRows.map((row) => [row.day, row.views]));

  const pick = (day: string) => ({
    visitors: visitsByDay.get(day)?.visitors ?? 0,
    views: viewsByDay.get(day) ?? 0,
  });

  const sumSince = (since: string, field: 'visitors' | 'views') => {
    let total = 0;
    for (const row of visitRows) {
      if (row.day >= since) total += field === 'visitors' ? row.visitors : 0;
    }
    for (const row of viewRows) {
      if (row.day >= since) total += field === 'views' ? row.views : 0;
    }
    return total;
  };

  const totalViews =
    db.select({ views: sql<number>`coalesce(sum(${pageViewDaily.views}), 0)` }).from(pageViewDaily).get()?.views ?? 0;

  const topPages = db
    .select({
      path: pageViewDaily.path,
      kind: pageViewDaily.kind,
      views: sql<number>`coalesce(sum(${pageViewDaily.views}), 0)`,
      entryId: sql<string | null>`max(${pageViewDaily.entryId})`,
    })
    .from(pageViewDaily)
    .where(gte(pageViewDaily.day, sinceRange))
    .groupBy(pageViewDaily.path)
    .orderBy(desc(sql`sum(${pageViewDaily.views})`))
    .limit(12)
    .all();

  const topEntries = db
    .select({
      id: entries.id,
      name: entries.name,
      type: entries.type,
      views: sql<number>`coalesce(sum(${pageViewDaily.views}), 0)`,
    })
    .from(pageViewDaily)
    .innerJoin(entries, eq(entries.id, pageViewDaily.entryId))
    .where(and(gte(pageViewDaily.day, sinceRange), isNull(entries.deletedAt)))
    .groupBy(entries.id)
    .orderBy(desc(sql`sum(${pageViewDaily.views})`))
    .limit(12)
    .all();

  const topRefs = db
    .select({ host: pageViewDaily.refHost, views: sql<number>`coalesce(sum(${pageViewDaily.views}), 0)` })
    .from(pageViewDaily)
    .where(and(gte(pageViewDaily.day, sinceRange), ne(pageViewDaily.refHost, '')))
    .groupBy(pageViewDaily.refHost)
    .orderBy(desc(sql`sum(${pageViewDaily.views})`))
    .limit(8)
    .all();

  const trend: TrafficDay[] = Array.from({ length: TRAFFIC_TREND_DAYS }, (_, index) => {
    const day = dayKeyAgo(TRAFFIC_TREND_DAYS - 1 - index);
    return { day, ...pick(day) };
  });

  return {
    today: pick(today),
    yesterday: pick(yesterday),
    viewsLast7: sumSince(since7, 'views'),
    viewsLast30: sumSince(since30, 'views'),
    visitorsLast7: sumSince(since7, 'visitors'),
    visitorsLast30: sumSince(since30, 'visitors'),
    totalViews,
    trend,
    rangeDays: days,
    topPages,
    topEntries,
    topRefs,
  };
}

export async function getAdminRecentEntries(limit = 8): Promise<EntryWithTags[]> {
  await requireAdmin();

  const rows = db
    .select()
    .from(entries)
    .where(isNull(entries.deletedAt))
    .orderBy(desc(entries.updatedAt))
    .limit(limit)
    .all();

  return attachTags(rows, true);
}

export async function getAdminRecentLinkFailures(limit = 5): Promise<LinkFailureRow[]> {
  await requireAdmin();

  return db
    .select({
      entryId: entries.id,
      entryName: entries.name,
      entryType: entries.type,
      statusCode: linkChecks.statusCode,
      error: linkChecks.error,
      checkedAt: linkChecks.checkedAt,
    })
    .from(linkChecks)
    .innerJoin(entries, eq(entries.id, linkChecks.entryId))
    .where(eq(linkChecks.ok, false))
    .orderBy(desc(linkChecks.checkedAt))
    .limit(limit)
    .all();
}

export async function getAdminSubmissions({
  status,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: { status?: string; page?: number; pageSize?: number } = {}): Promise<Paged<Submission>> {
  await requireAdmin();

  const where = status ? eq(submissions.status, status) : undefined;
  const totalRow = db.select({ count: sql<number>`count(*)` }).from(submissions).where(where).get();
  const total = totalRow?.count ?? 0;

  const items = db
    .select()
    .from(submissions)
    .where(where)
    .orderBy(desc(submissions.createdAt))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize)
    .all();

  return paginate(items, total, Math.max(1, page), pageSize);
}

export async function getAdminSubmissionById(id: string): Promise<Submission | null> {
  await requireAdmin();
  return db.select().from(submissions).where(eq(submissions.id, id)).get() ?? null;
}

export type ClickStatRow = {
  id: string;
  name: string;
  type: string;
  today: number;
  last7: number;
  last30: number;
  total: number;
  trend: number[];
};

export type ZeroClickRow = { id: string; name: string; type: string; updatedAt: Date };

const TREND_DAYS = 14;

export async function getAdminClickStats(limit = 200): Promise<ClickStatRow[]> {
  await requireAdmin();

  const today = dayKey();
  const since7 = dayKeyAgo(6);
  const since14 = dayKeyAgo(TREND_DAYS - 1);
  const since30 = dayKeyAgo(29);

  const rows = db
    .select({
      id: entries.id,
      name: entries.name,
      type: entries.type,
      total: entries.clickCount,
      today: sql<number>`coalesce(sum(case when ${clickLogs.day} = ${today} then ${clickLogs.count} else 0 end), 0)`,
      last7: sql<number>`coalesce(sum(case when ${clickLogs.day} >= ${since7} then ${clickLogs.count} else 0 end), 0)`,
      last30: sql<number>`coalesce(sum(case when ${clickLogs.day} >= ${since30} then ${clickLogs.count} else 0 end), 0)`,
    })
    .from(entries)
    .leftJoin(clickLogs, eq(clickLogs.entryId, entries.id))
    .where(isNull(entries.deletedAt))
    .groupBy(entries.id)
    .orderBy(desc(entries.clickCount))
    .limit(limit)
    .all();

  const trendRows = db
    .select({ entryId: clickLogs.entryId, day: clickLogs.day, count: clickLogs.count })
    .from(clickLogs)
    .where(gte(clickLogs.day, since14))
    .all();

  const trendMap = new Map<string, Map<string, number>>();
  for (const row of trendRows) {
    const byDay = trendMap.get(row.entryId) ?? new Map<string, number>();
    byDay.set(row.day, row.count);
    trendMap.set(row.entryId, byDay);
  }

  const days = Array.from({ length: TREND_DAYS }, (_, index) => dayKeyAgo(TREND_DAYS - 1 - index));

  return rows.map((row) => {
    const byDay = trendMap.get(row.id);
    return { ...row, trend: days.map((day) => byDay?.get(day) ?? 0) };
  });
}

export async function getAdminZeroClickEntries(days = 30, limit = 24): Promise<ZeroClickRow[]> {  await requireAdmin();

  const since = dayKeyAgo(days - 1);

  return db
    .select({ id: entries.id, name: entries.name, type: entries.type, updatedAt: entries.updatedAt })
    .from(entries)
    .where(
      and(
        isNull(entries.deletedAt),
        sql`not exists (select 1 from ${clickLogs} where ${clickLogs.entryId} = ${entries.id} and ${clickLogs.day} >= ${since})`,
      ),
    )
    .orderBy(desc(entries.createdAt))
    .limit(limit)
    .all();
}

export type QrcodeBoardRow = {
  id: string;
  label: string;
  kind: string;
  image: string;
  tip: string | null;
  expiresAt: Date | null;
  isActive: boolean;
  showCount: number;
  entryId: string;
  entryName: string;
  entrySlug: string;
  entryType: string;
};

export async function getAdminQrcodeBoard(limit = 200): Promise<QrcodeBoardRow[]> {
  await requireAdmin();

  return db
    .select({
      id: entryQrcodes.id,
      label: entryQrcodes.label,
      kind: entryQrcodes.kind,
      image: entryQrcodes.image,
      tip: entryQrcodes.tip,
      expiresAt: entryQrcodes.expiresAt,
      isActive: entryQrcodes.isActive,
      showCount: entryQrcodes.showCount,
      entryId: entries.id,
      entryName: entries.name,
      entrySlug: entries.slug,
      entryType: entries.type,
    })
    .from(entryQrcodes)
    .innerJoin(entries, eq(entries.id, entryQrcodes.entryId))
    .where(isNull(entries.deletedAt))
    .orderBy(sql`${entryQrcodes.expiresAt} is null`, asc(entryQrcodes.expiresAt))
    .limit(limit)
    .all();
}

export async function getAdminBranchBoard(): Promise<BranchBoardRow[]> {
  await requireAdmin();
  return selectBranchColumns(null).all();
}

/* ────────────────────────── 站长区（/me） ────────────────────────── */

/** 全量搜索（含私密），只有站长区用 */
export async function searchAdminEntries(keyword: string, limit = 100): Promise<EntryWithTags[]> {
  await requireAdmin();

  const normalized = normalizeKeyword(keyword);
  if (!normalized) return [];

  const pattern = `%${normalized}%`;

  const rows = db
    .select()
    .from(entries)
    .where(
      and(
        isNull(entries.deletedAt),
        sql`${entries.name} like ${pattern} or ${entries.nameEn} like ${pattern} or ${entries.summary} like ${pattern} or ${entries.url} like ${pattern} or ${entries.note} like ${pattern}`,
      ),
    )
    .orderBy(desc(entries.updatedAt))
    .limit(limit)
    .all();

  return attachTags(rows, true);
}

export type MeDashboard = {
  total: number;
  privateCount: number;
  unlistedCount: number;
  todo: number;
  visited: number;
  notes: number;
};

export async function getMeDashboard(): Promise<MeDashboard> {
  await requireAdmin();

  const countOf = (visibility: string) =>
    db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .where(and(isNull(entries.deletedAt), eq(entries.visibility, visibility)))
      .get()?.count ?? 0;

  const statusCount = (status: string) =>
    db
      .select({ count: sql<number>`count(*)` })
      .from(entryPrivate)
      .where(eq(entryPrivate.status, status))
      .get()?.count ?? 0;

  const notes =
    db
      .select({ count: sql<number>`count(*)` })
      .from(entryPrivate)
      .where(sql`${entryPrivate.note} is not null and length(trim(${entryPrivate.note})) > 0`)
      .get()?.count ?? 0;

  return {
    total: db.select({ count: sql<number>`count(*)` }).from(entries).where(isNull(entries.deletedAt)).get()?.count ?? 0,
    privateCount: countOf('private'),
    unlistedCount: countOf('unlisted'),
    todo: statusCount('todo'),
    visited: statusCount('visited'),
    notes,
  };
}

export type MeNoteRow = {
  entryId: string;
  entryName: string;
  entryType: string;
  entrySlug: string;
  visibility: string;
  rating: number | null;
  status: string | null;
  note: string | null;
  paid: string | null;
  visitedOn: string | null;
  updatedAt: Date;
};

export async function getMeNotes(limit = 100): Promise<MeNoteRow[]> {
  await requireAdmin();

  return db
    .select({
      entryId: entries.id,
      entryName: entries.name,
      entryType: entries.type,
      entrySlug: entries.slug,
      visibility: entries.visibility,
      rating: entryPrivate.rating,
      status: entryPrivate.status,
      note: entryPrivate.note,
      paid: entryPrivate.paid,
      visitedOn: entryPrivate.visitedOn,
      updatedAt: entryPrivate.updatedAt,
    })
    .from(entryPrivate)
    .innerJoin(entries, eq(entries.id, entryPrivate.entryId))
    .where(and(isNull(entries.deletedAt), sql`${entryPrivate.note} is not null and length(trim(${entryPrivate.note})) > 0`))
    .orderBy(desc(entryPrivate.updatedAt))
    .limit(limit)
    .all();
}

/* ────────────────────────── settings ────────────────────────── */

export type SiteSettings = {
  submissionsOpen: boolean;
  maintenanceMode: boolean;
  defaultVisibility: string;
};

const DEFAULT_SETTINGS: SiteSettings = {
  submissionsOpen: true,
  maintenanceMode: false,
  defaultVisibility: 'public',
};

/** settings 表按 key 存，这里读成站点设置对象 */
export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = db.select().from(settings).all();
  const map = new Map(rows.map((row) => [row.key, row.value]));

  const pick = <K extends keyof SiteSettings>(key: K): SiteSettings[K] => {
    const value = map.get(key);
    if (key === 'defaultVisibility') return (typeof value === 'string' ? value : DEFAULT_SETTINGS[key]) as SiteSettings[K];
    return (typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key]) as SiteSettings[K];
  };

  return {
    submissionsOpen: pick('submissionsOpen'),
    maintenanceMode: pick('maintenanceMode'),
    defaultVisibility: pick('defaultVisibility'),
  };
}

export { DEFAULT_SETTINGS };
