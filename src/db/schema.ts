import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * 数据表定义 —— 单一事实来源。
 * 改这里 → pnpm db:generate → pnpm db:migrate，禁止手写 SQL 迁移。
 *
 * 记法约定（SQLite）：
 *   uuid          → text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
 *   timestamptz   → integer('x', { mode: 'timestamp_ms' })
 *   boolean       → integer('x', { mode: 'boolean' })
 *   jsonb         → text('x', { mode: 'json' }).$type<T>()
 *   numeric(10,7) → real('x')
 *   date          → text('x')，存 'YYYY-MM-DD'
 */

const uuidPk = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

/** 条目的展示碎片里【不需要查询】的部分才放这里，要筛选的字段一律独立列 */
export type EntryMeta = {
  /** tool：是否已下线 */
  offline?: boolean;
  /** site：是否需要境外访问才能打开 */
  needProxy?: boolean;
};

export type ToolChangelogItem = {
  version: string;
  date: string;
  note: string;
};

/* ────────────────────────── entries ────────────────────────── */

export const entries = sqliteTable(
  'entries',
  {
    id: uuidPk(),
    /** tool | site | code | shop —— 决定进哪个列表 */
    type: text('type').notNull(),
    /** external | internal | place —— 决定详情页长什么样 */
    linkMode: text('link_mode').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    nameEn: text('name_en'),
    summary: text('summary').notNull(),
    /** external 时必填；internal / place 时为空 */
    url: text('url'),
    icon: text('icon'),
    cover: text('cover'),
    /**
     * place 可选：交给地图 App 的搜索词（留空用 name）。
     * 连锁品牌不维护门店地址时，就靠这个字段让访客在地图上找最近一家。
     */
    mapQuery: text('map_query'),
    note: text('note'),
    meta: text('meta', { mode: 'json' }).$type<EntryMeta>().notNull().default({}),
    /**
     * public 公开 | unlisted 不列出但可直达 | private 只有站长可见
     * ★ 公开路由永远只查 public，站长登录与否渲染结果一致（见 docs/PRIVACY.md 铁律 1）
     */
    visibility: text('visibility').notNull().default('public'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    /** active | stale | dead */
    status: text('status').notNull().default('active'),
    sortWeight: integer('sort_weight').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    clickCount: integer('click_count').notNull().default(0),
    lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** 软删除，null 表示未删 */
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('entries_type_slug_uniq').on(t.type, t.slug),
    index('entries_type_status_idx').on(t.type, t.status),
    index('entries_link_mode_idx').on(t.linkMode),
    index('entries_featured_idx').on(t.featured),
    index('entries_created_idx').on(t.createdAt),
    index('entries_visibility_idx').on(t.visibility, t.type, t.status),
  ],
);

/* ──────────────── entry_private（只有站长看得到的字段，1:1） ──────────────── */

export const entryPrivate = sqliteTable('entry_private', {
  entryId: text('entry_id')
    .primaryKey()
    .references(() => entries.id, { onDelete: 'cascade' }),
  /** 我的评分 1-5 */
  rating: integer('rating'),
  /** todo 想去 | visited 去过 | verified 已验证 | avoid 踩雷 */
  status: text('status'),
  note: text('note'),
  contact: text('contact'),
  paid: text('paid'),
  /** 'YYYY-MM-DD' */
  visitedOn: text('visited_on'),
  updatedAt: updatedAt(),
});

/* ────────────────────── entry_tools（自研工具，1:1） ────────────────────── */

export const entryTools = sqliteTable('entry_tools', {
  entryId: text('entry_id')
    .primaryKey()
    .references(() => entries.id, { onDelete: 'cascade' }),
  /** src/tools/ 下的目录名，必须与 registry.ts 的 key 完全一致 */
  component: text('component').notNull(),
  /** client | server */
  runtime: text('runtime').notNull().default('client'),
  requiresLogin: integer('requires_login', { mode: 'boolean' }).notNull().default(false),
  version: text('version'),
  usageCount: integer('usage_count').notNull().default(0),
  changelog: text('changelog', { mode: 'json' }).$type<ToolChangelogItem[]>().notNull().default([]),
});

/* ───────────────────── entry_branches（线下门店，1:N） ───────────────────── */

export const entryBranches = sqliteTable(
  'entry_branches',
  {
    id: uuidPk(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    /** 「静安寺店」，单店可留空 */
    name: text('name'),
    address: text('address').notNull(),
    province: text('province'),
    /** 必须填，用于筛选 */
    city: text('city').notNull(),
    district: text('district'),
    lat: real('lat'),
    lng: real('lng'),
    /** amap | baidu | manual */
    poiSource: text('poi_source'),
    poiId: text('poi_id'),
    phone: text('phone'),
    hours: text('hours'),
    /** 1-3 */
    priceLevel: integer('price_level'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    sort: integer('sort').notNull().default(0),
    status: text('status').notNull().default('active'),
  },
  (t) => [
    index('branches_entry_idx').on(t.entryId),
    index('branches_city_idx').on(t.city),
    index('branches_geo_idx').on(t.lat, t.lng),
  ],
);

/* ───────────────────── entry_qrcodes（二维码，1:N） ───────────────────── */

export const entryQrcodes = sqliteTable(
  'entry_qrcodes',
  {
    id: uuidPk(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    /** 「店主微信」「外卖群」「公众号」 */
    label: text('label').notNull(),
    /** wechat-group | wechat-personal | wechat-oa | miniprogram | alipay | custom */
    kind: text('kind').notNull(),
    /** /qrcodes/xxx.png，必须存在自己服务器上 */
    image: text('image').notNull(),
    tip: text('tip'),
    /** 微信群码 7 天过期，这个字段是运营刚需 */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    showCount: integer('show_count').notNull().default(0),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('qrcodes_entry_idx').on(t.entryId, t.sort), index('qrcodes_expires_idx').on(t.expiresAt)],
);

/* ───────────────── click_logs（点击统计，按天聚合） ───────────────── */

export const clickLogs = sqliteTable(
  'click_logs',
  {
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    /** 'YYYY-MM-DD' */
    day: text('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.day] })],
);

/* ───────────────────── visit_daily（访客去重，按天） ───────────────────── */

/**
 * 「今天多少人访问」靠这张表：一天一个访客一行。
 * visitorHash 是每天换盐的 HMAC（见 src/lib/analytics.ts），存不下也还原不出身份。
 * 写入方是页面渲染时的 after() 钩子，不是公开 API —— 所以这里同样没有 requireAdmin 的余地。
 */
export const visitDaily = sqliteTable(
  'visit_daily',
  {
    /** 'YYYY-MM-DD'（本地时区，见 lib/clicks.ts 的 dayKey） */
    day: text('day').notNull(),
    visitorHash: text('visitor_hash').notNull(),
    views: integer('views').notNull().default(0),
    /** 当天第一次落在哪个页面（入口页） */
    firstPath: text('first_path'),
  },
  (t) => [primaryKey({ columns: [t.day, t.visitorHash] }), index('visit_daily_day_idx').on(t.day)],
);

/* ──────────────── page_view_daily（页面浏览，按天 + 路径聚合） ──────────────── */

export const pageViewDaily = sqliteTable(
  'page_view_daily',
  {
    day: text('day').notNull(),
    /** 归一化路径：不带 query、不带尾斜杠 */
    path: text('path').notNull(),
    /** 外部来源域名；站内跳转与直接访问是空串（不用 NULL，避免 upsert 冲突判断出意外） */
    refHost: text('ref_host').notNull().default(''),
    /** home | list | detail | tag | search | tool | other */
    kind: text('kind').notNull().default('other'),
    /** 详情页才有：指向 entries.id */
    entryId: text('entry_id').references(() => entries.id, { onDelete: 'cascade' }),
    views: integer('views').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.path, t.refHost] }),
    index('page_view_daily_day_idx').on(t.day),
    index('page_view_daily_entry_idx').on(t.entryId, t.day),
  ],
);

/* ────────────────────────── tags ────────────────────────── */

export const tags = sqliteTable(
  'tags',
  {
    id: uuidPk(),
    dim: text('dim').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** #RRGGBB */
    color: text('color').notNull(),
    /** lucide 组件名 */
    icon: text('icon'),
    /** 标签聚合页正文，30-60 字 */
    desc: text('desc'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [uniqueIndex('tags_dim_slug_uniq').on(t.dim, t.slug), index('tags_dim_sort_idx').on(t.dim, t.sort)],
);

/* ────────────────────────── entry_tags ────────────────────────── */

export const entryTags = sqliteTable(
  'entry_tags',
  {
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] }), index('entry_tags_tag_idx').on(t.tagId)],
);

/* ────────────────────── submissions（访客投稿） ────────────────────── */

export const submissions = sqliteTable(
  'submissions',
  {
    id: uuidPk(),
    /** entry 推荐收录 | feedback 网站建议 / BUG */
    kind: text('kind').notNull().default('entry'),
    /** entry：推荐名称；feedback：一句话标题 */
    name: text('name').notNull(),
    /** entry 必填；feedback 选填（出问题的那个页面） */
    url: text('url'),
    /** 推荐人选的类型，可为空。只有 entry 用 */
    type: text('type'),
    /** entry：推荐理由；feedback：具体描述 */
    reason: text('reason'),
    contact: text('contact'),
    /** pending | approved | rejected（feedback 的 approved 表示已处理） */
    status: text('status').notNull().default('pending'),
    /** 通过后生成的条目。feedback 不生成条目，恒为空 */
    resultId: text('result_id').references(() => entries.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    /** 简单防刷，哈希后存 */
    ipHash: text('ip_hash'),
  },
  (t) => [index('submissions_status_created_idx').on(t.status, t.createdAt)],
);

/* ────────────────────── link_checks（死链巡检历史） ────────────────────── */

export const linkChecks = sqliteTable(
  'link_checks',
  {
    id: uuidPk(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    statusCode: integer('status_code'),
    ok: integer('ok', { mode: 'boolean' }).notNull(),
    /**
     * ok 通 | dead 确定失效（404 / 410、域名解析不到、连接被拒）
     * unclear 判不了（被反爬拦、限流、5xx、超时、TLS 握手失败）——
     * 只记录，不参与「疑似失效」判定，否则 403 / 超时会把好站反复标成疑似失效
     * 老数据为 null：同样不参与判定
     */
    verdict: text('verdict'),
    error: text('error'),
    checkedAt: createdAt(),
  },
  (t) => [index('link_checks_entry_idx').on(t.entryId, t.checkedAt)],
);

/* ────────────────────────── settings ────────────────────────── */

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/* ────────────────────────── 推导类型 ────────────────────────── */

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type EntryPrivate = typeof entryPrivate.$inferSelect;
export type EntryTool = typeof entryTools.$inferSelect;
export type EntryBranch = typeof entryBranches.$inferSelect;
export type EntryQrcode = typeof entryQrcodes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type LinkCheck = typeof linkChecks.$inferSelect;
export type Setting = typeof settings.$inferSelect;
