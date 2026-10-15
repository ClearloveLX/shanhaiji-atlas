# 数据模型设计 — 山海集 Atlas

> 解决的问题：站里要同时装下**外部链接、自研在线工具、外部二维码、线下好店地址**这几种
> 形态完全不同的东西，还要能一起搜索、一起打标签、一起出现在标签页里。
>
> 结论先说：**一条 `entry` = 一个「可以被推荐的东西」**，形态差异用 `link_mode` 区分，
> 形态专属且**需要查询**的字段进独立子表，纯展示碎片才放 jsonb。

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
| 「能否离线使用」 | jsonb `meta` | 只展示，不查询 |

jsonb 不是垃圾桶。凡是需要 `WHERE` / `ORDER BY` / 建索引的，一律独立列。

### 原则 3 · `link_mode` 决定点了去哪，`type` 决定它是什么

两个字段正交，不要混：

| | 含义 | 取值 |
|---|---|---|
| `entries.type` | 内容分类，决定进哪个列表 | `tool` \| `site` \| `shop` |
| `entries.link_mode` | 交互形态，决定详情页长什么样 | `external` \| `internal` \| `place` |

组合起来：

| type | link_mode | 是什么 | 主按钮 |
|---|---|---|---|
| `tool` | `external` | 别人的在线工具（Figma） | 访问官网（外链） |
| `tool` | `internal` | **我自研的小工具** | 打开工具（站内 `/tools/x/app`） |
| `site` | `external` | 常用站点（B 站） | 访问网站（外链） |
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

在原有 6 张表基础上，新增 4 张，修改 1 张。

### 2.1 `entries`（修改：加两个字段）

```ts
export const entries = pgTable('entries', {
  id:          uuid('id').primaryKey().defaultRandom(),
  type:        varchar('type', { length: 10 }).notNull(),        // tool | site | shop
  linkMode:    varchar('link_mode', { length: 10 }).notNull(),   // ★ 新增 external | internal | place
  slug:        varchar('slug', { length: 80 }).notNull(),
  name:        varchar('name', { length: 60 }).notNull(),
  nameEn:      varchar('name_en', { length: 80 }),
  summary:     varchar('summary', { length: 200 }).notNull(),
  url:         text('url'),                                       // ★ 改为可空：internal/place 没有外链
  icon:        text('icon'),
  cover:       text('cover'),                                     // ★ 新增：店铺/工具封面图
  note:        text('note'),
  meta:        jsonb('meta').notNull().default({}),
  featured:    boolean('featured').notNull().default(false),
  status:      varchar('status', { length: 8 }).notNull().default('active'),
  sortWeight:  integer('sort_weight').notNull().default(0),
  viewCount:   integer('view_count').notNull().default(0),
  clickCount:  integer('click_count').notNull().default(0),       // ★ 新增：外链点击总数
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('entries_type_slug_uniq').on(t.type, t.slug),
  index('entries_type_status_idx').on(t.type, t.status),
  index('entries_link_mode_idx').on(t.linkMode),
  index('entries_created_idx').on(t.createdAt.desc()),
])
```

约束（DB check + Zod 双重）：

- `link_mode = 'external'` → `url` 必须非空且是合法 URL
- `link_mode = 'internal'` → `url` 必须为空，且必须存在对应的 `entry_tools` 记录
- `link_mode = 'place'` → `url` 可为空，且必须至少有 1 条 `entry_branches`

### 2.2 `entry_tools`（新增）— 自研工具专属

```ts
export const entryTools = pgTable('entry_tools', {
  entryId:       uuid('entry_id').primaryKey().references(() => entries.id, { onDelete: 'cascade' }),
  component:     varchar('component', { length: 60 }).notNull(),  // src/tools/ 下的目录名，与 registry key 一致
  runtime:       varchar('runtime', { length: 10 }).notNull().default('client'), // client | server
  requiresLogin: boolean('requires_login').notNull().default(false),
  version:       varchar('version', { length: 20 }),
  usageCount:    integer('usage_count').notNull().default(0),
  changelog:     jsonb('changelog').notNull().default([]),        // [{ version, date, note }]
})
```

**关键约束**：`component` 的值必须在 `src/tools/registry.ts` 里注册过。
后台保存时服务端会读 registry 校验，对不上直接报错
「组件 `qr-generator` 未在 src/tools/registry.ts 注册」——
防止数据库里存了一个跑不起来的工具。

### 2.3 `entry_branches`（新增）— 线下门店

```ts
export const entryBranches = pgTable('entry_branches', {
  id:        uuid('id').primaryKey().defaultRandom(),
  entryId:   uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  name:      varchar('name', { length: 60 }),                     // 「静安寺店」，单店可留空
  address:   varchar('address', { length: 200 }).notNull(),
  province:  varchar('province', { length: 20 }),
  city:      varchar('city', { length: 20 }).notNull(),           // ★ 用于筛选，必须填
  district:  varchar('district', { length: 20 }),
  lat:       numeric('lat', { precision: 10, scale: 7 }),
  lng:       numeric('lng', { precision: 10, scale: 7 }),
  poiSource: varchar('poi_source', { length: 10 }),               // amap | baidu | manual
  poiId:     varchar('poi_id', { length: 64 }),
  phone:     varchar('phone', { length: 30 }),
  hours:     varchar('hours', { length: 120 }),                   // 「11:00-22:00，周一休」
  priceLevel: smallint('price_level'),                            // 1-3
  isPrimary: boolean('is_primary').notNull().default(false),
  sort:      integer('sort').notNull().default(0),
  status:    varchar('status', { length: 8 }).notNull().default('active'),
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

### 2.4 `entry_qrcodes`（新增）— 二维码

```ts
export const entryQrcodes = pgTable('entry_qrcodes', {
  id:          uuid('id').primaryKey().defaultRandom(),
  entryId:     uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  label:       varchar('label', { length: 30 }).notNull(),        // 「店主微信」「外卖群」「公众号」
  kind:        varchar('kind', { length: 20 }).notNull(),         // 见下表
  image:       text('image').notNull(),                           // /qrcodes/xxx.png
  tip:         varchar('tip', { length: 120 }),                   // 展示在码下方的一句提示
  expiresAt:   timestamp('expires_at', { withTimezone: true }),   // ★ 微信群码 7 天过期
  isActive:    boolean('is_active').notNull().default(true),
  showCount:   integer('show_count').notNull().default(0),        // 被展开查看次数
  sort:        integer('sort').notNull().default(0),
}, (t) => [
  index('qrcodes_entry_idx').on(t.entryId, t.sort),
  index('qrcodes_expires_idx').on(t.expiresAt),                   // ★ 后台「快过期」看板靠它
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
后台 `/admin/qrcodes` 要有一个看板：按过期时间排序，**3 天内到期标黄、已过期标红并自动 `is_active=false`**。
这个页面应该出现在每周维护清单里。

### 2.5 `click_logs`（新增）— 点击统计（按天聚合）

```ts
export const clickLogs = pgTable('click_logs', {
  entryId: uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  day:     date('day').notNull(),
  count:   integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.entryId, t.day] })])
```

**为什么不存每次点击的明细行？**
一天几百次点击，一年就是十万行，而你要看的只是「哪个条目受欢迎」。
按天聚合后一年最多 `条目数 × 365` 行，而且 `ON CONFLICT DO UPDATE count = count + 1` 写入极快。
真要做精细分析再上第三方统计，不要在业务库里堆明细。

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
/admin/entries                      条目列表（三种形态混排，可按 link_mode 筛）
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

## 四、三类内容的实现要点

### 4.1 外部链接

**要点：所有外链走 `/go/[slug]`，不要直接放原始 URL。**

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

卡片和列表上的链接也走 `/go/[slug]`，但在 HTML 上直接写 `/go/[slug]`，不要用 JS 拦截点击——
保证中键、Ctrl+点击、右键复制链接都正常。

### 4.2 自研在线工具

**要点：工具是代码，条目是数据，两者用 `component` 字段对齐。**

```
src/tools/                          ← 工具代码
├── registry.ts                     ← slug → 元数据 + 懒加载函数（唯一注册处）
├── qr-generator/
│   ├── index.tsx                   ← 默认导出工具组件
│   ├── meta.ts                     ← { slug, name, description, needsWorker?, serverless? }
│   ├── worker.ts                   ← 需要重计算时的 Web Worker
│   └── lib/                        ← 该工具专属逻辑
├── image-compressor/
└── text-diff/
```

```ts
// src/tools/registry.ts
export const TOOL_REGISTRY = {
  'qr-generator': {
    meta: () => import('./qr-generator/meta').then(m => m.default),
    Component: () => import('./qr-generator'),
  },
  'image-compressor': { ... },
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

---

## 五、存储策略

| 资源 | 放哪 | 说明 |
|---|---|---|
| 条目图标 | `data/uploads/public/icons/{slug}.png` | 128×128，后台抓取或上传 |
| 二维码 | `data/uploads/public/qrcodes/{slug}-{n}.png` | 原图不压缩，≥430px |
| 封面图 | `data/uploads/public/covers/{slug}.webp` | 转 webp，宽度 800 |

**绝对不要把上传的文件放进 `public/`。** 部署方式是「本地构建 → rsync 覆盖 `app/`」，
`public/` 每次发布都会被整个替换掉，放里面的上传文件全丢。
完整说明见 [`SERVER-DEPLOY.md`](SERVER-DEPLOY.md) 第八节：

| 资源 | 存哪 | 访问 URL |
|---|---|---|
| 公开图标 / 二维码 / 封面 | `data/uploads/public/{icons,qrcodes,covers}/` | `/media/{kind}/{file}`（Caddy 直接读盘） |
| 私密条目的图片 | `data/uploads/private/{entryId}/` | `/api/file/...`（`requireAdmin()`） |

留一个抽象层 `src/lib/storage.ts`，导出 `putObject(kind, filename, buffer, visibility)` /
`deleteObject(path)`，内部按 `visibility` 自动选目录并返回正确的 URL。
以后要迁阿里云 OSS 或 Cloudflare R2，只改这一个文件。

**先不要上对象存储。** 图标 + 二维码 + 封面加起来通常不到 500MB，本地卷足够，
用一个 `STORAGE_DRIVER=local|oss` 的环境变量留好口子就行。

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

7. **把所有形态差异塞进 jsonb** → 想按城市筛选时发现筛不了，只能全表捞出来在内存里过滤。
   要查询的字段必须是独立列。
