# 数据模型设计 — 山海集 Atlas

> 解决的问题：站里要同时装下**外部链接、自研在线工具、外部二维码、线下好店地址**这几种
> 形态完全不同的东西，还要能一起搜索、一起打标签、一起出现在标签页里。
>
> 结论先说：**一条 `entry` = 一个「可以被推荐的东西」**，形态差异用 `link_mode` 区分，
> 形态专属且**需要查询**的字段进独立子表，纯展示碎片才放 `meta`（JSON 字段）。

---

## 一、五条设计原则

### 原则 1 · 一条 entry = 一个可以被推荐的东西

不管是网页、自研工具、线下店，只要有名字、有简介、能打标签，就是一条 `entry`。
好处：列表页、搜索、标签聚合页、sitemap、RSS、投稿审核、批量操作——**全部只写一遍**。

不要为「工具」和「店铺」建两套表。那会让搜索、标签、SEO 各写两遍，一年后你自己都不想维护。

### 原则 2 · 共有字段进主表，形态专属字段进子表

判断标准只有一个：**这个字段需不需要被查询、筛选、排序？**

| 字段 | 去哪 | 为什么 |
|---|---|---|
| 城市、经纬度 | 独立列（`entry_branches`） | 要按城市筛、按距离排 |
| 二维码过期时间 | 独立列（`entry_qrcodes`） | 后台要扫「快过期的码」 |
| 工具组件名 | 独立列（`entry_tools`） | 要和代码 registry 对齐校验 |
| 「能否离线使用」 | `entries.meta`（JSON 列） | 只展示，不查询 |

`meta` 不是垃圾桶。凡是需要 `WHERE` / `ORDER BY` / 建索引的，一律独立列。

### 原则 3 · `link_mode` 决定点了去哪，`type` 决定它是什么

两个字段正交，不要混：

| | 含义 | 取值 |
|---|---|---|
| `entries.type` | 内容分类，决定进哪个列表 | `tool` \| `site` \| `code` \| `shop` |
| `entries.link_mode` | 交互形态，决定详情页长什么样 | `external` \| `internal` \| `place` |

组合起来：

| type | link_mode | 是什么 | 主按钮 |
|---|---|---|---|
| `tool` | `external` | 别人的工具或软件官网（Figma、XMind） | 访问官网（外链） |
| `tool` | `internal` | **我自研的小工具** | 打开工具（站内 `/tools/x/app`） |
| `site` | `external` | 常用站点（B 站） | 访问网站（外链） |
| `code` | `external` | 开源仓库 / 代码站（GitHub、Gitee） | 访问仓库（外链） |
| `shop` | `external` | 线上店铺 | 去逛逛（外链） |
| `shop` | `place` | **线下好店** | 导航过去（地图 deeplink） |

**为什么不用 type 直接区分「外链工具 vs 自研工具」？**
因为列表页和标签页要把它们**混在一起展示**（用户不关心这个工具是谁做的），
只有详情页和表单才需要知道区别。用 `link_mode` 是「同一类东西的不同形态」，
用 `type` 是「不同类的东西」——语义不同。

### 原则 4 · 后台表单按 `link_mode` 分叉

这是运营效率的关键。新建条目时第一步只问一句「这是什么」：

```
○ 外部链接 —— 推荐一个别人做的东西
○ 自研工具 —— 我自己做的，跑在站内
○ 线下好店 —— 有实体地址的店
```

选完只显示该形态需要的字段。**不要让运营面对 30 个字段猜哪些该填。**

### 原则 5 · 二维码是独立资源，不是条目上的一个字段

一个店铺可能同时有「店主微信」「外卖群」「公众号」「小程序」四张码，
每张码有**各自的过期时间**（微信群码 7 天就失效）和各自的展示统计。

所以 `entry_qrcodes` 是 **1:N**，不是 `entries.qrcode` 一个字段。

---

## 二、完整表结构

> ### ⚠️ 权威在哪
>
> 项目已经建好，**`src/db/schema.ts` 才是权威定义**（它才是真正跑起来的那份）。
> 本节下面的代码是它的**阅读镜像**，配合文字解释「为什么这么设计」。
>
> - 要改表结构 → 改 `src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`
> - 改完顺手回来同步本节的镜像（或者干脆删掉镜像，只留文字说明）
> - **两者冲突时，永远以 `src/db/schema.ts` 为准**
>
> 本节对**还没写代码的部分**（比如以后新增的表）仍然是权威设计依据。

### 2.0 导入与类型约定

```ts
// src/db/schema.ts
import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'
```

这是 **SQLite** 项目，不是 Postgres。类型映射：

| 想要的东西 | SQLite 写法 |
|---|---|
| 主键 uuid | `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())` |
| 字符串 | `text('name')`（SQLite 不强制长度，长度校验交给 Zod） |
| 布尔 | `integer('featured', { mode: 'boolean' }).notNull().default(false)` |
| 整数 / smallint | `integer('sort')` |
| 小数（经纬度） | `real('lat')` |
| 时间戳 | `integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())` |
| 日期（YYYY-MM-DD） | `text('visited_on')` |
| JSON | `text('meta', { mode: 'json' }).$type<Meta>().notNull().default({})` |

**不要出现 `pgTable` / `jsonb` / `timestamptz` / `uuid()` / `varchar()` —— 那些是 Postgres 的。**
（唯一例外：讲"以后怎么迁到 Postgres"时提及）

### 2.1 `entries` —— 四类条目统一主表

```ts
export const entries = sqliteTable('entries', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  type:          text('type').notNull(),          // tool | site | code | shop
  linkMode:      text('link_mode').notNull(),     // external | internal | place
  visibility:    text('visibility').notNull().default('public'),  // public | unlisted | private
  slug:          text('slug').notNull(),
  name:          text('name').notNull(),
  nameEn:        text('name_en'),
  summary:       text('summary').notNull(),       // 一句话，20-60 字
  url:           text('url'),                     // external 必填；internal/place 为空
  icon:          text('icon'),                    // /media/icons/xxx.png
  cover:         text('cover'),                   // /media/covers/xxx.webp
  mapQuery:      text('map_query'),               // type=shop 可选：交给地图 App 的搜索词，留空用 name
  note:          text('note'),                    // 编辑手记
  meta:          text('meta', { mode: 'json' }).$type<EntryMeta>().notNull().default({}),
  featured:      integer('featured', { mode: 'boolean' }).notNull().default(false),
  status:        text('status').notNull().default('active'),      // active | stale | dead
  sortWeight:    integer('sort_weight').notNull().default(0),
  viewCount:     integer('view_count').notNull().default(0),
  clickCount:    integer('click_count').notNull().default(0),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
  createdAt:     integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt:     integer('deleted_at', { mode: 'timestamp_ms' }),  // 软删除，null 表示未删
}, (t) => [
  uniqueIndex('entries_type_slug_uniq').on(t.type, t.slug),
  index('entries_type_status_idx').on(t.type, t.status),
  index('entries_link_mode_idx').on(t.linkMode),
  index('entries_featured_idx').on(t.featured),
  index('entries_created_idx').on(t.createdAt),
  index('entries_visibility_idx').on(t.visibility, t.type, t.status),
])
```

注意 `entries_visibility_idx` 是**复合索引**（`visibility` 打头）——
因为公开查询永远是 `WHERE visibility = 'public' AND type = ? AND status = ?` 这个形状，
复合索引能让它走一次索引就定位，不用回表过滤。

约束（Zod 校验 + 服务端强制，SQLite 的 CHECK 约束能力有限，以应用层为准）：

- `link_mode = 'external'` → `url` 必须非空且是合法 URL
- `link_mode = 'internal'` → `url` 必须为空，且必须存在对应的 `entry_tools` 记录
- `link_mode = 'place'` → 「门店列表」和「地图搜索」至少有一个出口：
  - 填了 `entry_branches` → 详情页逐个门店给导航按钮（独立小店、常去的店用这种）
  - 一条门店都不填 → 详情页给「在地图上找最近的」按钮组，搜索词取 `map_query`，留空则取 `name`
    （连锁品牌用这种：不用维护几十家门店地址，访客在地图 App 里按距离找最近一家）
  - 两者可以同时存在（比如只维护三家常去的门店，其余让访客自己搜）
- `map_query` 只有 `type = 'shop'` 才有意义（其它类型填了会被拒），且**任何 `link_mode` 都能填**：
  `external` 的网店如果也有实体店（迪卡侬、盒马、MUJI），详情页会同时给「访问官网」和「在地图上找最近的」
- `visibility` 的三档行为见 [PRIVACY.md](PRIVACY.md) 第一节的行为矩阵
- `sort_weight` 是**全站唯一的手动顺序**（越大越靠前），`src/db/queries.ts` 里只有 `manualOrder()`
  一处定义。**所有类型混在同一条队列里**：工具、站点、源码、好店不分组，后台拖到哪就是哪，
  **可以跨类型拖**（拖动走 `reorderEntry`，键盘走 `moveEntry`）。前台 `/tools`、`/sites`、`/codes`、`/shops`、
  搜索结果、以及首页「编辑精选」全都从这条队列里各取自己那一段 —— 所以「先分类筛选、再按实际顺序看」
  得到的就是它。没调过的条目权重都是 0，退回按收录时间排，所以「不调 = 和以前一样」。
- 后台 `/admin/entries` 默认就打开「手动排序」（站长进来想看的是自己排的那套顺序，而不是「按更新时间」）：
  按住任意一行上下拖动即可调整，键盘用户选中左侧序号后按 ↑↓ 也能微调。列表最左边的「序号」就是它
  在**整条队列里排第几位**（`getAdminEntryPositions()` 用窗口函数一次算完，跨分页也算得准；
  不列出 / 私密的条目不进前台，所以没有名次，显示 `—`）。
  拖动落位是按「放到谁的哪一边」传给服务端（`reorderEntry(id, targetId, before | after)`），
  不是传行号 —— 后台可能正带着筛选条件，看到的行号和真实名次对不上，用邻居定位才不会错位。
  点表头排序后，表头会出现一个 × 用来清除排序（回到手动顺序）。
  调整时会把整条队列重排成 10 的倍数（否则两个 0 互换等于没动），且**不动 `updated_at`**：
  调顺序不是内容改动，不该把「按更新时间」的列表搅乱。
  新建条目时留 0 会自动取「全站最大权重 + 10」（排到最前），否则第一次调完顺序后，新条目会掉到最后。
- **「编辑精选」不另排一套顺序**，它就是从这条队列里筛出 `featured = true` 的那几条
  （`getPublicFeatured()`），所以后台看到的顺序就是精选区的顺序；`featured` 只决定「收不收进精选」。
  「精选优先」（`sort=featured`）是另一回事：精选的排前面，组内仍是这条队列。
- **点击量（`click_count`）不参与排序**，只在后台列表里显示给站长当参考（`/admin/entries` 的「点击」列，
  第二行是详情页浏览量 `view_count`）。理由：按点击自动排会让初始化阶段无从下手 ——
  新站刚上线时所有条目点击都是 0，谁先谁后全凭噪声。要看「谁最常用」去 `/admin/clicks`。

> `map_query` 存在的理由：条目名往往带英文（「小佩 PETKIT」「盒马 Freshippo」），
> 直接拿去地图里搜会搜不到。这个字段让人填一个地图认识的词（「小佩」「盒马鲜生」），
> 是**不用维护门店地址时的替代品**，所以它可空、永远不参与排序和筛选。

### 2.2 `entry_tools`（自研工具专属，1:1）

```ts
export const entryTools = sqliteTable('entry_tools', {
  entryId:       text('entry_id').primaryKey().references(() => entries.id, { onDelete: 'cascade' }),
  component:     text('component').notNull(),   // src/tools/ 下的目录名，与 registry key 一致
  runtime:       text('runtime').notNull().default('client'),   // client | server
  requiresLogin: integer('requires_login', { mode: 'boolean' }).notNull().default(false),
  version:       text('version'),
  usageCount:    integer('usage_count').notNull().default(0),
  changelog:     text('changelog', { mode: 'json' }).$type<{ version: string; date: string; note: string }[]>().notNull().default([]),
})
```

**关键约束**：`component` 的值必须在 `src/tools/registry.ts` 里注册过。
后台保存时服务端会读 registry 校验，对不上直接报错
「组件 `qr-generator` 未在 src/tools/registry.ts 注册」——
防止数据库里存了一个跑不起来的工具。

### 2.3 `entry_branches`（线下门店，1:N）

```ts
export const entryBranches = sqliteTable('entry_branches', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryId:    text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  name:       text('name'),                       // 「静安寺店」，单店可留空
  address:    text('address').notNull(),
  province:   text('province'),
  city:       text('city').notNull(),             // ★ 用于筛选，必须填
  district:   text('district'),
  lat:        real('lat'),                        // GCJ-02
  lng:        real('lng'),                        // GCJ-02
  poiSource:  text('poi_source'),                 // amap | baidu | manual
  poiId:      text('poi_id'),
  phone:      text('phone'),
  hours:      text('hours'),                      // 「11:00-22:00，周一休」
  priceLevel: integer('price_level'),             // 1-3
  isPrimary:  integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  sort:       integer('sort').notNull().default(0),
  status:     text('status').notNull().default('active'),
}, (t) => [
  index('branches_entry_idx').on(t.entryId),
  index('branches_city_idx').on(t.city),
  index('branches_geo_idx').on(t.lat, t.lng),
])
```

**一个品牌一条 entry，多家门店多条 branch。**
不要「一家店一条 entry」——那样「Manner 咖啡」会有 50 条重复条目，标签页里刷屏，
搜索「Manner」出 50 个结果。用户找的是「一家离我近的店」，所以**门店需要能被单独筛选和排序**，
但也需要挂在品牌下被统一管理。这就是 1:N 的理由。

单店（非连锁）就是一条 branch，前台不显示「门店列表」，和连锁店共用同一套代码。

### 2.4 `entry_qrcodes`（二维码，1:N）

```ts
export const entryQrcodes = sqliteTable('entry_qrcodes', {
  id:        text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryId:   text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  label:     text('label').notNull(),             // 「店主微信」「外卖群」「公众号」
  kind:      text('kind').notNull(),              // 见下表
  image:     text('image').notNull(),             // /media/qrcodes/xxx.png
  tip:       text('tip'),                         // 展示在码下方的一句提示
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),   // ★ 微信群码 7 天过期
  isActive:  integer('is_active', { mode: 'boolean' }).notNull().default(true),
  showCount: integer('show_count').notNull().default(0),
  sort:      integer('sort').notNull().default(0),
}, (t) => [
  index('qrcodes_entry_idx').on(t.entryId, t.sort),
  index('qrcodes_expires_idx').on(t.expiresAt),   // ★ 后台「快过期」看板靠它
])
```

`kind` 取值：

| 值 | 中文 | 典型有效期 |
|---|---|---|
| `wechat-group` | 微信群 | **7 天**（最需要盯） |
| `wechat-personal` | 个人微信 | 长期 |
| `wechat-oa` | 公众号 | 长期 |
| `miniprogram` | 小程序码 | 长期 |
| `alipay` | 支付宝 | 长期 |
| `custom` | 其它 | 自定 |

**`expiresAt` 这个字段是本设计的重点。** 微信群二维码 7 天失效是运营里最容易翻车的事：
用户扫了发现「该群二维码已过期」，你的站就失信了。
后台 `/admin/qrcodes` 有一个看板：按过期时间排序，**3 天内到期标黄、已过期标红**。

⚠️ **标红只是提醒，`isActive` 不会自己变成 `false`。** 真正下架要靠调 `sweepExpiredQrcodes()`
（`src/lib/qrcodes.ts`），它只有两个触发口：

| 触发方式 | 怎么用 |
|---|---|
| `/api/cron/qrcodes`（带 `x-cron-token`） | 配进 atlas 的 crontab，每天跑一次（命令见 [MAINTENANCE.md](MAINTENANCE.md) W3） |
| 后台按钮「一键停用所有已过期的码」 | `deactivateExpiredQrcodes`，手动点 |

**没配 cron 也不会自动发生** —— 这个页面应该出现在每周维护清单里。

### 2.5 `click_logs`（点击统计，按天聚合）

```ts
export const clickLogs = sqliteTable('click_logs', {
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  day:     text('day').notNull(),                 // 'YYYY-MM-DD'
  count:   integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.entryId, t.day] })])
```

**为什么不存每次点击的明细行？**
一天几百次点击，一年就是十万行，而你要看的只是「哪个条目受欢迎」。
按天聚合后一年最多 `条目数 × 365` 行，而且 `ON CONFLICT DO UPDATE count = count + 1`
（SQLite 支持，语法和 Postgres 相同）写入极快。
真要做精细分析再上第三方统计，不要在业务库里堆明细。

### 2.6 `entry_private`（只有站长看得到的字段，1:1）

用途和行为规则见 [PRIVACY.md](PRIVACY.md) 第四节，这里只给定义：

```ts
export const entryPrivate = sqliteTable('entry_private', {
  entryId:   text('entry_id').primaryKey().references(() => entries.id, { onDelete: 'cascade' }),
  rating:    integer('rating'),                   // 我的评分 1-5
  status:    text('status'),                      // todo 想去 | visited 去过 | verified 已验证 | avoid 踩雷
  note:      text('note'),                        // 私人备注
  contact:   text('contact'),                     // 老板微信/电话等不公开联系方式
  paid:      text('paid'),                        // 实际花费，如「人均 80」
  visitedOn: text('visited_on'),                  // 'YYYY-MM-DD'
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})
```

### 2.7 `tags` 与 `entry_tags`

字段语义见 [TAGS.md](TAGS.md) 第三节。

```ts
export const tags = sqliteTable('tags', {
  id:    text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  dim:   text('dim').notNull(),                   // scene | attr | platform | price | quality | private
  slug:  text('slug').notNull(),
  name:  text('name').notNull(),
  color: text('color').notNull(),                 // #RRGGBB
  icon:  text('icon'),                            // lucide 组件名
  desc:  text('desc'),                            // 标签聚合页正文，30-60 字
  sort:  integer('sort').notNull().default(0),
}, (t) => [
  uniqueIndex('tags_dim_slug_uniq').on(t.dim, t.slug),
  index('tags_dim_sort_idx').on(t.dim, t.sort),
])

export const entryTags = sqliteTable('entry_tags', {
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  tagId:   text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.entryId, t.tagId] }),
  index('entry_tags_tag_idx').on(t.tagId),
])
```

### 2.8 `submissions` / `link_checks` / `settings`

```ts
export const submissions = sqliteTable('submissions', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind:       text('kind').notNull().default('entry'),   // entry 推荐收录 | feedback 网站建议 / BUG
  name:       text('name').notNull(),                    // entry：推荐名称；feedback：一句话标题
  url:        text('url'),                               // entry 必填；feedback 选填（出问题的那个页面）
  type:       text('type'),                              // 只有 entry 用：推荐人猜的类型，可为空
  reason:     text('reason'),
  contact:    text('contact'),
  status:     text('status').notNull().default('pending'),   // pending | approved | rejected
  resultId:   text('result_id').references(() => entries.id, { onDelete: 'set null' }),
  ipHash:     text('ip_hash'),
  createdAt:  integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
}, (t) => [index('submissions_status_created_idx').on(t.status, t.createdAt)])
```

**一张表装两种投稿，靠 `kind` 分**：`entry` 是「推荐一个收录」，走完流程会变成一条 `entries`；
`feedback` 是「网站建议 / BUG」，只进后台给人看，**不生成条目** —— 所以它不用 `resultId`，
`url` 也可以空（「手机上时间轴溢出」这种问题根本指不出一个链接）。
两者共用 `status`：feedback 的 `approved` 意思是「已处理」。
表单差异在 `src/lib/validation.ts` 的 `submissionInputSchema`：
entry 必须有合法 url、理由 ≥20 字；feedback 的理由 ≥5 字就够。

```ts
export const linkChecks = sqliteTable('link_checks', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryId:    text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  statusCode: integer('status_code'),
  ok:         integer('ok', { mode: 'boolean' }).notNull(),
  verdict:    text('verdict'),   // ok | dead | unclear（老数据为 null）—— 见下方说明
  error:      text('error'),
  checkedAt:  createdAt(),   // ⚠️ 列名是 created_at，不是 checked_at —— 见下方说明
}, (t) => [index('link_checks_entry_idx').on(t.entryId, t.checkedAt)])

export const settings = sqliteTable('settings', {
  key:       text('key').primaryKey(),
  value:     text('value', { mode: 'json' }).notNull(),
  updatedAt: updatedAt(),
})
```

> ⚠️ **`link_checks` 的时间列名是 `created_at`，不是 `checked_at`。**
> TS 变量叫 `checkedAt`（语义上想说「这次检查的时间」），但它是用 `schema.ts` 顶部的
> `createdAt()` 生成的，那个 helper 写死了列名 `created_at`。
> 所以这一列**不符合** [`NAMING.md`](NAMING.md) 第 5 节「列名跟语义走、`last_checked_at` 那种命名」的惯例。
> **以 `src/db/schema.ts` 为准** —— 手工写 SQL 时用 `created_at`
> （迁移实证：`drizzle/0000_condemned_leech.sql`），写成 `checked_at` 会报 `no such column`。
> 改列名要出新迁移、动已有数据，所以这里只记录现状，不改代码。

**`verdict` 是三档判定，不是布尔 `ok` 的重复。** 巡检结果分：

| verdict | 什么情况 | 会不会动 `entries.status` |
|---|---|---|
| `ok` | HTTP 200-399 | 不动 |
| `dead` | 404 / 410、`ENOTFOUND`（域名没了）、`ECONNREFUSED`（端口没开） | **连续 2 次**才 active → `stale` |
| `unclear` | 401 / 403 / 406 / 429 / 451、5xx、超时、TLS 握手失败、**首页返回 404**（多半是在拦机器人） | **永远不动**，只留记录 |

`unclear` 单独存在的理由：很多站会拒绝没有浏览器指纹的请求（403 / 406）、限流（429）、
或者要 8 秒以上才回第一个字节；把它们当死链，好站会被反复标成「疑似失效」，
每次都要人肉改回来。老数据 `verdict` 为 null，同样不参与判定。

**需要外网才能打开的域名会被巡检直接跳过**（名单在 `src/lib/link-check.ts` 的
`DEFAULT_SKIP_HOSTS`，`LINK_CHECK_SKIP_HOSTS` 可覆盖）—— 这些条目**不发请求、不写 `link_checks`**，
状态完全靠人工在后台改。国内机房里 ChatGPT / Gemini 这一批直连就是超时，巡检不出任何有意义的结果。

**注意 SQLite 没有自增序列那一套** —— 主键一律是应用层生成的 uuid（`$defaultFn`），
不依赖数据库自增。这样备份、迁移、跨环境复制都不会出问题。

### 2.9 `visit_daily`（访客去重，按天）

「今天多少人访问」靠的就是这张表：**一天一个访客一行**。

```ts
export const visitDaily = sqliteTable('visit_daily', {
  day:         text('day').notNull(),            // 'YYYY-MM-DD'（本地时区）
  visitorHash: text('visitor_hash').notNull(),   // 每天换盐的 HMAC，见 4.5
  views:       integer('views').notNull().default(0),
  firstPath:   text('first_path'),               // 当天第一次落在哪个页面（入口页）
}, (t) => [
  primaryKey({ columns: [t.day, t.visitorHash] }),
  index('visit_daily_day_idx').on(t.day),
])
```

**存的不是身份，是一个当天有效、第二天就变的对不上号的摘要**：
`HMAC-SHA256(AUTH_SECRET, 'pv:{day}:{ip}:{ua}')` 取前 32 位。同一访客同一天是同一个值（能去重成「1 人」），
隔天换盐之后前后完全无法关联。原始 IP 和 UA **不入库**，只在内存里参与一次哈希。

### 2.10 `page_view_daily`（页面浏览，按天 + 路径聚合）

```ts
export const pageViewDaily = sqliteTable('page_view_daily', {
  day:     text('day').notNull(),
  path:    text('path').notNull(),        // 归一化路径：不带 query、不带尾斜杠，最多 120 字
  refHost: text('ref_host').notNull().default(''),   // 外部来源域名；站内跳转和直接访问是空串
  kind:    text('kind').notNull().default('other'),  // home | list | detail | tag | search | tool | other
  entryId: text('entry_id').references(() => entries.id, { onDelete: 'cascade' }),  // 详情页才有
  views:   integer('views').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.day, t.path, t.refHost] }),
  index('page_view_daily_day_idx').on(t.day),
  index('page_view_daily_entry_idx').on(t.entryId, t.day),
])
```

和 `click_logs` 同一个思路：**按天聚合，不存明细行**。
一次浏览 = 两条 upsert（`visit_daily` +1、`page_view_daily` +1），都在一个事务里，写在
`after()` 里执行，不占响应时间（写入路径见 4.5）。

`ref_host` 不用可空列而用空串：SQLite 的主键列允许 NULL，会让 upsert 的冲突判断变得不可预期，
统一用空串表示「没有外部来源」。

---

## 三、路由设计

### 前台

```
/tools                              工具列表（外链工具 + 自研工具混排）
/tools/[slug]                       工具详情（介绍 / 标签 / 推荐 / SEO 正文）
/tools/[slug]/app                   ★ 自研工具运行页（全屏，无导航无页脚）

/sites                              站点列表
/sites/[slug]                       站点详情

/shops                              店铺列表（线上 + 线下混排）
/shops/[slug]                       店铺详情（线上店：去逛逛；线下店：地址+地图+导航+二维码）
/shops/map                          ★ 好店地图（一张图看全部线下店，按城市/标签筛）

/tags                               标签总览
/tags/[dim]/[slug]                  标签聚合页
/search                             搜索
/submit                             投稿
/go/[slug]                          ★ 外链跳转中间页
/q/[code]                           短链（阶段二）
```

### 后台

```
/admin                              仪表盘
/admin/entries                      条目列表（三种形态混排，可按 link_mode 筛；sort=manual 时用 ↑↓ 调顺序）
/admin/entries/new?mode=external    新建：外部链接
/admin/entries/new?mode=internal    新建：自研工具
/admin/entries/new?mode=place       新建：线下好店
/admin/entries/[id]/edit            编辑（表单按 link_mode 自动分叉）
/admin/branches                     ★ 门店管理（按城市分组，可批量改营业时间）
/admin/qrcodes                      ★ 二维码看板（按过期时间排序，快到期的排最前）
/admin/tags                         标签管理
/admin/submissions                  投稿审核
/admin/clicks                       ★ 点击统计（哪个条目最常用）
/admin/trash                        回收站
/admin/imports                      导入导出
/admin/settings                     站点设置
```

---

## 四、四类内容的实现要点

### 4.1 外部链接

**要点：所有外链走 `/go/[slug]`，不要直接放原始 URL。**

> `type=site`（站点分享）和 `type=code`（源码分享）走的都是这一套，区别只在进哪个列表页；
> 主按钮文案按 `type` 微调（访问网站 / 访问仓库），跳转逻辑完全相同。

```
src/app/go/[slug]/route.ts
  → 查 entry，取 url
  → upsert click_logs (entry_id, today, +1)
  → 302 到真实 URL，带 Cache-Control: no-store
  → 找不到或 status='dead' 时，跳到一个中间页提示「该链接可能已失效」并推荐同类条目
```

好处：
1. 统计准确，且不会被广告拦截器拦掉（`sendBeacon` 会被 uBlock 之类拦）
2. 以后换域名、接联盟链接，不用改任何已发出的链接
3. 可以统一加 `nofollow`，并在这里做一次「链接是否还活着」的检查
4. 挂了的外链有兜底页，不会给用户一个 404

代价：多一次 302 跳转，约 50-100ms。对导航站来说，拿到点击数据远比这点延迟值钱。

**列表和首页的卡片指向详情页**（`/tools/{slug}` 这类站内地址），不是 `/go/[slug]` ——
详情页才是「决定要不要去」的地方，外链只在详情页的主按钮上走 `/go/[slug]`。

**标签页策略**（这条决定了用起来顺不顺）：

| 点哪里 | 行为 |
|---|---|
| 列表 / 首页 / 搜索结果的卡片 | `target="_blank"` **新开标签**进详情，列表留在原标签不动 |
| 详情页的主按钮（访问官网 / 打开工具） | **覆盖当前标签** —— 外链直接跳走，自研工具换成 `/tools/{slug}/app` |

于是一个东西占一个标签：原标签始终是列表，看完一个详情就地变成真站点，不会出现
「列表没了、详情页还杵在那儿、真站点又在第三个标签」的局面。

卡片链接一律用 HTML 原生 `<a>` / `<Link>`，不要用 JS 拦截点击 ——
保证中键、Ctrl+点击、右键复制链接都正常。

### 4.2 自研在线工具

**要点：工具是代码，条目是数据，两者用 `component` 字段对齐。**

```
src/tools/                          ← 工具代码
├── registry.ts                     ← slug → 懒加载函数（唯一注册处）
├── qr-generator/
│   ├── index.tsx                   ← 默认导出工具组件
│   ├── meta.ts                     ← { slug, name, description, needsWorker?, usesServer?, version }
│   ├── worker.ts                   ← 需要重计算时的 Web Worker
│   └── lib/                        ← 该工具专属逻辑
├── text-diff/
├── eat-today/                      ← 今天吃什么：清单存在浏览器缓存里
└── farm-planner/                   ← 护肝农场：休息时段 / 土地配置存在浏览器缓存里
```

```ts
// src/tools/registry.ts
export const TOOL_REGISTRY = {
  'qr-generator': {
    load: (): Promise<ToolModule> => import('./qr-generator'),
  },
  'eat-today': {
    load: (): Promise<ToolModule> => import('./eat-today'),
  },
} as const

export type ToolSlug = keyof typeof TOOL_REGISTRY
```

硬性约定：

| 约定 | 原因 |
|---|---|
| 每个工具**只**在 `registry.ts` 注册一次 | 后台校验 `component` 字段靠它 |
| 工具组件必须是 `'use client'` | 浏览器里跑，不吃服务器资源 |
| **默认纯前端**，用户数据不出浏览器 | 这是卖点，写在工具页上；也省服务器 |
| 需要重计算的（图片压缩、大文件解析）用 Web Worker | 否则主线程卡死，页面像挂了 |
| 需要服务端的（PDF、OCR）放 `/api/tools/[slug]/` + 每 IP 限流 | 别让一个脚本把服务器跑满 |
| 每个工具单独 `next/dynamic` 懒加载 | 10 个工具不能打成一个 2MB 的 chunk |
| 用户配置一律存浏览器缓存，key 用 `atlas.{工具名}.v1` | 自研工具没有账号体系，配置不该上服务器；带版本号是为了以后改结构时能识别旧数据 |
| 工具页 **不放导航、页脚、推荐位** | 用工具的人只想干活 |

**详情页与功能页分离**（这是 SEO 和体验都要的关键）：

| 路径 | 内容 | 作用 |
|---|---|---|
| `/tools/qr-generator` | 介绍、截图、标签、相关推荐、使用说明 | 吃搜索流量、进标签页、被收藏 |
| `/tools/qr-generator/app` | 纯功能界面，全屏窄容器 | 干活 |

加一个新工具的完整流程（十分钟）：

1. `src/tools/my-tool/` 建目录，写 `index.tsx` + `meta.ts`
2. `registry.ts` 加一行
3. 后台 `/admin/entries/new?mode=internal` 填名称、简介、标签，组件名下拉选 `my-tool`
4. 保存 → 前台 `/tools/my-tool` 和 `/tools/my-tool/app` 立刻可用

**加工具不需要改数据库、不需要写迁移、不需要动路由。** 这是这个设计要达到的效果。

### 4.3 线下好店

**要点：地址不要手填经纬度，用地理编码 API 补，然后让人在地图上确认一个点。**

录入流程：

```
后台填地址 → 服务端调高德地理编码 API → 返回 { lng, lat, poiId, formattedAddress }
         → 前端在嵌入地图上显示一个可拖拽的标记
         → 人工确认（很重要：API 经常定到马路对面或同名小区）
         → 保存
```

导航按钮（用户点「导航」时按设备给选项）：

| 平台 | URL 模板 |
|---|---|
| 高德 | `https://uri.amap.com/marker?position={lng},{lat}&name={name}&src=shanhaiji` |
| 百度 | `https://api.map.baidu.com/marker?location={lat},{lng}&title={name}&content={addr}&output=html` |
| Apple 地图 | `https://maps.apple.com/?ll={lat},{lng}&q={name}` |
| 复制地址 | 纯文本兜底 |

详情页地图用**高德静态地图 API**（一张图片 URL），不要嵌 JS SDK——
静态图不需要 key 配额、不加载 200KB 脚本、不会因为你没备案而报错。
只有 `/shops/map` 聚合页才用 JS SDK。

「我在这附近」功能：

```sql
-- 先用 bounding box 粗筛（走索引），再算精确距离
SELECT *, (6371 * acos(cos(radians($lat)) * cos(radians(lat)) * cos(radians(lng) - radians($lng))
       + sin(radians($lat)) * sin(radians(lat)))) AS distance_km
FROM entry_branches
WHERE lat BETWEEN $lat - 0.45 AND $lat + 0.45     -- ≈50km
  AND lng BETWEEN $lng - 0.45 AND $lng + 0.45
  AND status = 'active'
ORDER BY distance_km LIMIT 20;
```

**不要上 PostGIS。** 几千条门店，bounding box + 哈弗辛公式足够了，
少一个扩展少一份部署麻烦。等门店过万再考虑。

### 4.4 二维码
两类，别混淆：

**A 类 · 别人给的外部码**（微信群、公众号）→ 存图展示

- 图片**必须传到自己的存储**（`data/uploads/public/qrcodes/` 或对象存储），
  **绝对不能外链微信/第三方图床** —— 那些链接几天就失效，站上会变成一片裂图
- 上传时不压缩过猛：微信识别对清晰度敏感，建议**边长 ≥ 430px**、PNG 格式
- 展示时机：详情页里做成侧栏卡片或「展开查看」，不要一进页面就弹窗糊用户一脸
- 每张码要有 `label`，因为一个店可能同时有 4 张码
- `expiresAt` 到期后自动隐藏，并在后台标红

**B 类 · 你生成的站内码**（阶段二）→ 指向自己的页面

给每家好店生成一个二维码，打印出来贴在店里/名片上，扫了直接进你的店铺页。
这类码走 `/q/[code]` 短链，可以换目标、可以统计扫码量。

```
short_links
  id, code(unique, 8位), target(站内路径), entry_id, label, hit_count, expires_at, created_at
```

生成用 `qrcode` 这个 npm 包在服务端出 PNG，或直接在自研工具里生成。

### 4.5 访问统计

**要点：在服务端记，不在浏览器里打点。**

```
每个公开页面 render 时
  → await trackPageView({ path, kind, entryId? })     // render 阶段读 headers + 会话
  → after(() => 写 visit_daily + page_view_daily)     // 响应发出后才写库，不占用户的时间
```

⚠️ Next 不允许在 `after()` 里读请求上下文（`headers()` / `cookies()` 会直接抛
`used "headers" inside "after(...)". This is not supported.`）。
所以分工必须是：**render 阶段读请求信息，after 阶段只写库**，别把 `headers()` 挪进回调里。

顺带一个好处：因为读了 `headers()`，调用它的页面必然是动态渲染的 ——
静态页不会统计，也就不会出现「只在构建时记了一次」这种诡异数据。

为什么不用 `sendBeacon` / 客户端打点（即使它更简单）：

1. **会被广告拦截器拦掉**。uBlock 一类默认规则会拦 `/api/pv`、`/collect`、`/track` 这种路径，
   丢掉的正是最活跃的那批用户，而他们恰恰是最该被统计的
2. **关掉 JS 就统计不到**，服务端渲染的页面本来不需要 JS
3. 多一个公开 API 路由，就多一个要防刷、要限流的入口

四条过滤规则（都在 `src/lib/analytics.ts` 里，改之前先看这里）：

| 情况 | 怎么判断 | 为什么 |
|---|---|---|
| 预取 | 请求头有 `Next-Router-Prefetch` | `Link` 一进视口 Next 就会预取页面，不过滤的话一个列表页能刷出十几个假访问 |
| 爬虫 | UA 匹配 bot/crawl/spider/headless/curl 等 | 搜索引擎爬虫会把「今日访客」顶成几百 |
| 站长自己 | `auth()` 有会话 | 不然你每次刷新都算一个访客，永远看不到真实数字 |
| 404 | 页面本身不调用记录函数 | 扫描器打随机路径，不该进统计 |

写入落在两张按天聚合的表上（见 2.9 / 2.10），**不存明细行、不存 IP、不写 cookie**。
详情页浏览会顺带 +1 `entries.view_count`（和点击统计维护 `click_count` 是同一套做法）。

页面识别靠 `path` 归一化：去掉 query、去掉尾斜杠、截断到 120 字。
`/tools?tags=...` 和 `/tools` 算同一个页面 —— 你要看的是「哪个页面有人看」，不是「哪个链接被点了」。

---

## 五、存储策略

| 资源 | 放哪 | 说明 |
|---|---|---|
| 条目图标 | `data/uploads/public/icons/{slug}-{hash8}.png` | 128×128，后台抓取或上传 |
| 条目图标（矢量） | `data/uploads/public/icons/{slug}-{hash8}.svg` | **原样保留不裁**，上传时洗掉脚本能力（见 `src/lib/svg.ts`） |
| 二维码 | `data/uploads/public/qrcodes/{slug}-{hash8}.png` | 原图不压缩，≥430px |
| 封面图 | `data/uploads/public/covers/{slug}-{hash8}.webp` | 转 webp，宽度 800 |

**文件名里的 `{hash8}` 是内容指纹（`putObject` 自动加，sha256 前 8 位）。**
不是为了好看，是因为 `/media/*` 带 `Cache-Control: immutable`：文件名不变 URL 就不变，
浏览器永远不会回源 —— 换了图标也还是显示旧图（「换了没反应」就是这么来的）。
带上指纹后，内容一变 URL 就变，缓存自然失效；内容没变则文件名相同，不会重复占地方。
换图时会顺手删掉被替换掉的旧文件 —— 走 `deleteIfUnused()`
（`src/lib/upload-gc.ts`，调用点在 `src/actions/entries.ts`），
但如果那个文件还被别的条目封面或某张二维码引用着就保留。

**SVG 图标为什么要单独洗一遍**：它是唯一「能被浏览器当文档直接打开、里面还能跑脚本」的图片格式。
项目里只在 `<img>` 里用它（`<img>` 不执行脚本），但文件本身可以被直接访问（`/media/icons/x.svg`），
所以 `uploadImage` 会先过 `sanitizeSvg()`：删 `<script>` / `foreignObject` / SMIL 动画 / `on*` 事件属性 /
`javascript:` / 外链引用，只保留文档内部引用（`#id`）和 `data:image/`。
`/media` 路由对 `.svg` 另加 `CSP: sandbox` 兜底 —— 但生产环境 `/media` 由 Caddy 直接读盘、不走那个路由，
所以**上传时的清洗才是主要防线**。基于正则的清洗挡的是已知执行路径，不是完整的 XML 解析。

**绝对不要把上传的文件放进 `public/`。** 部署方式是「本地构建 → 只把构建产物传上去」，
`public/` 每次发布都会被整个替换掉，放里面的上传文件全丢。
完整说明见 [`DEPLOY.md`](DEPLOY.md) 第五、六节：

| 资源 | 存哪 | 访问 URL |
|---|---|---|
| 公开图标 / 二维码 / 封面 | `data/uploads/public/{icons,qrcodes,covers}/` | `/media/{kind}/{file}`（Caddy 直接读盘） |
| 私密条目的图片 | `data/uploads/private/{entryId}/` | `/api/file/...`（`requireAdmin()`） |

留一个抽象层 `src/lib/storage.ts`，导出 `putObject(input)` / `deleteObject(url)` /
`resolveLocalPath(url)`。`putObject` 收的是**一个对象参数**：

```ts
putObject({ kind, filename, buffer, visibility, entryId? })
// kind: 'icons' | 'qrcodes' | 'covers'
// visibility: 'public' | 'private'（'private' 时 entryId 必填，用作目录名）
```

它内部按 `visibility` 选目录、给文件名加上内容指纹（`contentAddressed()`），
并返回可直接放进 `<img src>` 的 URL。清理孤儿文件是另一个函数 `deleteIfUnused()`
（`src/lib/upload-gc.ts`），不在这个文件里。

**先不要上对象存储。** 图标 + 二维码 + 封面加起来通常不到 500MB，本地卷足够。
**目前没有 `STORAGE_DRIVER` 这类开关** —— 落盘位置是写死的本地卷
（`storage.ts` 顶部的 `UPLOAD_DIR`，可用同名环境变量改根目录，仅此而已）。
真要迁阿里云 OSS 或 Cloudflare R2，改 `src/lib/storage.ts` 这**一个文件**就行：
它已经是全项目唯一知道「磁盘目录 ⇄ 访问 URL」对应关系的地方，
把 `putObject` / `deleteObject` / `resolveLocalPath` 三个函数的实现换掉即可，
上层（`src/actions/uploads.ts` 和各个组件）一行都不用动。

### 分享图与中文字体（可选配置）

分享图**不是静态文件**：没有 `public/og/default.png` 这种东西，它是动态路由
`src/app/og/route.tsx`，用 `next/og`（satori）现画一张 1200×630 的图。

satori **不内置中文字形**，不喂字体文件的话中文会渲染成空白。可选的 `OG_FONT_PATH`
环境变量就是为这个准备的 —— 按顺序找第一个存在的文件：

| 优先级 | 位置 | 说明 |
|---|---|---|
| 1 | `$OG_FONT_PATH` | 环境变量，指向任意路径的 TTF/OTF |
| 2 | `./data/fonts/NotoSansSC-Regular.ttf` | **推荐放这里**（`data/` 不会被部署覆盖） |
| 3 | `./public/fonts/NotoSansSC-Regular.ttf` | 备选；放这里的每次发布都会重新上传 |

字体越小越好（Google Fonts 搜 Noto Sans SC 下 TTF 子集）。
**不配也能跑**：会退化成只渲染英文站名 + 主色带，不会 500。

---

## 六、这次设计里最容易踩的坑

1. **把自研工具的元数据写死在代码里** → 前台列表读不到、打不了标签、进不了搜索。
   正确做法：功能在代码，元数据在数据库，靠 `component` 对齐。

2. **二维码外链微信图床** → 一周后全站裂图。必须自己存。

3. **忘了微信群码 7 天过期** → 用户扫码看到「二维码已过期」，站就不可信了。
   `expiresAt` + 后台看板是刚需，不是锦上添花。

4. **一家连锁店建 50 条 entry** → 标签页刷屏、搜索重复。品牌 = entry，门店 = branch。

5. **手填经纬度** → 十有八九填错。用地理编码 API + 地图上人工确认。

6. **外链直接放原始 URL** → 拿不到点击数据，换域名时全站链接作废。走 `/go/[slug]`。

7. **把所有形态差异塞进 `meta`** → 想按城市筛选时发现筛不了，只能全表捞出来在内存里过滤。
   要查询的字段必须是独立列。
