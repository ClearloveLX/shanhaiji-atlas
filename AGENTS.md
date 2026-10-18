# AGENTS.md — 山海集 Atlas 常驻开发规则

> 喂给 AI 编码助手的**常驻上下文**，放项目根目录，每次对话自动生效。
>
> **给 AI 的指令**：临时需求写在对话里，**不要在做任务的过程中顺手改这份文件**
> —— 一张嘴就能说完的事不该变成改规则。
>
> **给人（站长）的说明**：这份文件当然要维护。当架构、技术栈、部署方式发生变化时，
> 必须同步改这里，否则它会变成一份过时的、甚至自相矛盾的规则，
> 而 AI 会把它当权威照做。改的时候注意全文搜一遍关键字，
> 确保新说法和旧的硬性规则、禁止事项不冲突。

---

## 1. 项目是什么

「山海集 Atlas」是一个**可持续维护的生活导航站**：收录**工具、站点、源码与好店**，
按多维度标签组织，支持搜索、多标签筛选、标签聚合页。

**核心诉求是「好维护」**：日常加内容、改标签、处理投稿，全部在 `/admin` 后台点几下完成，
不允许出现「改一条数据要动代码 / 重新构建」的设计。

## 2. 技术栈（不要擅自更换，不要引入同类替代品）

- Next.js 15 App Router + React 19 + TypeScript（strict）
- **数据库：SQLite（better-sqlite3）+ Drizzle ORM**，迁移用 drizzle-kit，库文件在 `data/atlas.db`
- **认证：Auth.js v5（next-auth@beta）**，Credentials 单管理员，JWT session
- 写操作一律用 **Server Actions**，不要建 REST API。仅四个例外（白名单，与第 5 节目录表一致）：
  `/api/auth`、`/api/file`、`/api/cron/*`、`/api/search`（只读搜索，给命令面板用）
- 样式：Tailwind CSS v4 + shadcn/ui（new-york）+ lucide-react
- 表单校验：Zod（同一份 schema 前后端复用）
- 缓存：`unstable_cache` + `revalidateTag` / `revalidatePath`，**不要用实验性的 `use cache`**
- 包管理：pnpm；Node 22；本地开发端口固定 **4000**

**部署形态**：`output: 'standalone'` + 原生 Node + Caddy + systemd。
**目标机器只有 2 核 / 2 GB 内存（日常可用约 1.2 GB，另挂 2 GB swap）**，因此：

- **绝对不要加 `output: 'export'`**——会变成静态站，失去后台维护能力
- **不要引入 Docker、PostgreSQL、Redis 或任何额外常驻进程**（2 核 2 GB 的机器，Docker 会吃掉近一半可用内存）
- **默认不在服务器上跑 `pnpm build`**：不是会 OOM（swap 已实测够用），而是服务器
  构建要 5-15 分钟，且期间站点被换出到 swap 变慢；本地构建 + 打包传输只要 40 秒。
  **但这是取舍不是禁令** —— 紧急情况可以 `git clone` 到新 release 目录里构建再换软链。
- **部署用 release 目录 + 软链**（`/opt/atlas/releases/{时间戳}` + `current` 软链），
  **永远不要在 `current/` 里构建或传产物**，那样会读到写了一半的文件，也没法秒级回滚。
  传输方式是 **tar.gz + SFTP**（`deploy.py`）—— 开发机上**没有 rsync**，别照旧文档写 rsync 命令
- 用户上传的文件放 `data/uploads/`，**不要放 `public/`**

## 3. 内容形态（先读这一段再动代码）

一条 `entry` = 一个「可以被推荐的东西」。形态差异用 `entries.link_mode` 区分，共三种：

| link_mode | 是什么 | 详情页主按钮 | 专属子表 |
|---|---|---|---|
| `external` | 别人的网站 / 工具 / 网店 | 访问官网 → **走 `/go/{slug}`** | 无 |
| `internal` | **我自研的在线工具** | 打开工具 → 站内 `/tools/{slug}/app` | `entry_tools` |
| `place` | **线下好店**，有实体地址 | 导航过去 → 地图 deeplink | `entry_branches` |

配套规则：

- `entries.type`（tool/site/code/shop）决定**进哪个列表**；`link_mode` 决定**详情页长什么样**。两者正交，不要混。
- **自研工具的功能代码在 `src/tools/<slug>/`；给 registry 用的最小元数据在同目录 `meta.ts`
  （`{ slug, name, description, version, usesServer, needsWorker }`）；可检索、可筛选、进 SEO 的部分
  （标签、正文介绍、推荐位）在数据库里。** 两者靠 `entry_tools.component`
  与 `src/tools/registry.ts` 的 key 对齐。加工具不改数据库结构。
- **一个品牌一条 entry，多家门店多条 `entry_branches`。** 不要一家店建一条 entry。
- **二维码是 `entry_qrcodes`（1:N），不是条目上的一个字段。** 每张码有独立的
  `expires_at`（微信群码 7 天过期）、`label` 和统计。
- **所有外链必须指向 `/go/{slug}`，禁止在页面里直接输出 `entries.url`。**

## 4. 可见性与私密层（改这块之前先读 docs/PRIVACY.md）

`entries.visibility` 三档：`public` 公开 / `unlisted` 不列出但可直达 / `private` 只有站长可见。

**三条铁律，违反任意一条都会静默泄漏，且不会有任何报错：**

1. **一个 URL 只有一种内容。** 公开路由（`(site)` 路由组）**永远只查 `visibility = 'public'`**，
   站长登录与否渲染结果完全一致。私密内容走独立的 `/me/*` 路由空间。
   **绝对不要**在公开页面里 `await auth()` 然后决定多渲染几条——那会把私密内容
   缓存给下一个匿名访客（`unstable_cache` 的 key 里没有登录态）。
2. **查询层只有两套 API，没有第三套。** `getPublic*` 硬编码 `visibility = 'public'` 且不接受外部传参；
   `getAdmin*` 第一行必须 `await requireAdmin()` 且**不加任何缓存**。
   `src/db/queries.ts` 里不允许存在不带可见性过滤的通用查询函数。
3. **上传的文件一律走 `src/lib/storage.ts`，落到 `data/uploads/`，绝不写进 `public/`。**
   `public/` 只放构建期静态资源，每次发布都会被新产物整体替换（本项目 `public/` 目前**是空的**，
   这是正常的：favicon 在 `src/app/favicon.ico`，分享图是动态路由 `src/app/og/route.tsx`），
   往里放上传文件 = 下次发布全丢。
   公开图片落在 `data/uploads/public/`，URL 是 `/media/...`（生产环境由 Caddy 直接读盘）；
   私密图片落在 `data/uploads/private/{entryId}/`，URL 是 `/api/file/...`，
   该路由必须 `requireAdmin()` 且返回 `Cache-Control: private, no-store`
   + `X-Robots-Tag: noindex, nofollow`。
   **隔离靠的是两个不同的访问出口，不是两个不同的目录。**

其它必须记住的：

- 私密条目直接访问公开 URL → 一律 `notFound()` 返回 **404，不是 403**（403 泄露了「它存在」）
- 公开查询关联标签时必须排除 `dim = 'private'`，否则「私藏」会出现在公开筛选栏
- 公开的标签计数**只统计 public 条目**，否则点进去条数对不上，还暗示了有隐藏内容
- 从 public 改成 private 时，`revalidatePath` 要同时覆盖改之前和改之后的所有路径
- 私密条目的 `/go/[slug]` 跳转必须 `requireAdmin()`

## 5. 目录约定

| 路径 | 放什么 |
|---|---|
| `src/app/(site)/` | 前台路由组 |
| `src/app/(admin)/admin/` | 后台路由组，全部需要登录 |
| `src/app/api/` | **只有四个白名单**：`/api/auth`（Auth.js）、`/api/file`（私密文件）、`/api/cron/*`、`/api/search`（只读搜索，给命令面板用）。其余一律用 Server Actions |
| `src/actions/` | 所有 Server Actions，一个领域一个文件 |
| `src/db/` | `schema.ts`（表定义）、`index.ts`（连接）、`queries.ts`（读）、`seed.ts` |
| `src/tools/` | **自研在线工具**。一个工具一个目录，`registry.ts` 是唯一注册处 |
| `src/lib/` | 纯函数：validation / auth / tags / revalidate / seo / geocode / map-links / storage |
| `src/components/ui/` | shadcn 生成，**不要手改** |
| `src/components/{admin,card,filter,search,layout}/` | 业务组件 |
| `drizzle/` | 生成的 SQL 迁移，**不要手改**，改 schema 后重新 generate |
| `data/` | **运行时**数据：`atlas.db`、上传的图片、备份。**永不随部署覆盖** |
| `scripts/` | 独立 Node 脚本（备份、导入、死链巡检） |
| `docs/` | 文档 |

文件命名：组件 `PascalCase.tsx`；工具函数与 hook 用 `kebab-case.ts`，导出 `camelCase`。

## 6. 硬性规则

1. **先改 schema 再改代码。** 加字段 = 改 `src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate` → 再写代码。**禁止手写 SQL 迁移**。
2. **写操作必须走 Server Action**，并且第一行就是 `await requireAdmin()`；不要在前台组件里直连数据库写数据。
3. **所有查询走 `src/db/queries.ts`**，页面组件里不出现 `db.select()`。查询函数统一加缓存标签（`entries` / `tags`）。
4. **不引入新依赖。** 除非我在同一条消息里点名要装。特别是：不要加状态管理库、不要加表格库（用原生 table + shadcn）、不要加日期库（用 `Intl`）、不要加 ORM 以外的数据库工具。
5. **不写 `any`**，不用 `@ts-ignore`，不用 `as unknown as` 绕类型。
6. **默认 Server Component。** 只有真的需要 hooks / 事件监听才加 `'use client'`，且加在**最小粒度的叶子组件**上，不要加在页面级。
7. **改完数据必须刷新缓存**：任何写库的 Action 结尾都要按 `src/lib/revalidate.ts` 里的映射调用 `revalidatePath`，否则前台看不到更新。这是本项目最容易出的 bug。
8. **文案用简体中文，标识符用英文，代码注释用中文。** 面向用户不要出现「本站」「我们」这类自称。
9. **无障碍**：可点击元素有可读文本或 `aria-label`；图片有 `alt`；对比度达 WCAG AA。
10. **不写动画库**。hover 最多 `transition` + `shadow`/`scale`，时长 ≤ 200ms。
11. **每次改完跑 `pnpm lint && pnpm typecheck && pnpm build`**，报错全部修掉再回复。修不了的明说哪一条、报什么错、试过什么。
12. **`link_mode` 的一致性由服务端强制校验**：`external` 必须非空 `url`；`internal` 必须能在 `TOOL_REGISTRY` 里找到 `component`；`place` 必须至少有一条 `entry_branches`。三条都不满足就拒绝保存。
13. **加一个自研工具 = 建目录 + registry 加一行 + 后台建条目**。不需要改数据库结构、不需要写迁移、不需要动路由。如果你发现自己在为一个新工具改 `src/db/schema.ts`，停下来重新想。
14. **图片和二维码必须存在自己的服务器上**，落在 `data/uploads/`（**不是 `public/`** ——
    理由和目录划分见第 4 节铁律 3）。禁止引用第三方图床或微信 CDN 的地址。
    上传统一走 `src/lib/storage.ts`，由它按 `visibility` 选目录并返回正确的 URL。
15. **需要查询的字段必须是独立列，不许塞进 `entries.meta`。** 要按城市筛就建 `city` 列，
    要按过期时间排序就建 `expires_at` 列。（`meta` 是 SQLite 的一个 JSON 文本列，
    不是 Postgres 的 jsonb —— 见第 2 节的类型约定。）
16. **`src/db/schema.ts` 的唯一来源是 [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) 第二节。**
    写 schema 时照抄那里，不要自己发挥、不要凭记忆写。这是 **SQLite** 项目：
    不允许出现 `pgTable` / `uuid()` / `varchar()` / `jsonb` / `timestamptz` /
    `defaultRandom()` / `defaultNow()` —— 那些在 `drizzle-orm/sqlite-core` 里编译不过。
    `PRIVACY.md`、`TAGS.md` 只讲字段语义，代码一律以 `DATA-MODEL.md` 为准。

## 7. 后台（/admin）与站长区（/me）的设计要求

后台是这个项目的**主要使用界面**，维护效率优先于好看：

- 列表页必须是表格，支持：关键字搜索、按类型/状态/标签筛选、按更新时间排序、分页（每页 50）
- 状态（精选 / 已失效）在列表里**可直接切换**，不用进编辑页
- 支持批量操作：批量打标签、批量改状态、批量删除（软删除）
- 每个表单都要有未保存提醒，提交时按钮进 loading 态，成功后 toast + 留在原页（除非是新建）
- 所有删除都是**软删除**（`deleted_at`），后台有回收站可以恢复
- 危险操作（删除、合并标签、导入覆盖）必须二次确认

## 8. 视觉规范

- 前台：**只引用 CSS 变量名，不要在文档或代码里写死色值**（写死就会漂移）。变量名：
  `--canvas`（页面底色，比卡片暗一档）、`--background`（卡片，纯白）、`--foreground`（正文）、
  `--brand`（电光蓝：链接 / 选中态 / 焦点环 / 强调）、`--primary`（墨黑：主按钮，和 brand 分工不要混）、
  `--muted-foreground`（次要文字）、`--border`、`--radius`（卡片圆角）、`--shadow-lift`（卡片悬浮投影）。
  **这些变量的具体值以 `src/styles/globals.css` 的 `:root` 为准，本文件不复制色值。**
  内容最大宽 `1240px`，留白优先
- 后台：中性灰调，信息密度高，圆角 `8px`，不要主色大面积铺色
- 不用 emoji 当图标，一律 lucide-react

## 9. 回复风格

- **先给代码/结论，再给一句话说明。** 不要「好的，我来帮你…」这类开场。
- 不要反问「你希望怎么做」，按规则直接做，做完说清改了什么、怎么验证。
- 不贴大段 diff，不复述需求。
- 一次只做要求的事，**不要顺手重构无关文件**。
- 要求会破坏上面任一条硬性规则时，按规则做，并在结尾一行说明你改了什么。

## 10. 禁止事项

- 禁止 `output: 'export'`、禁止把数据库换成 JSON/Markdown 文件
- **禁止引入 Docker / PostgreSQL / Redis / 任何额外常驻进程**（服务器只有约 1.2 GB 可用内存）
- **禁止把用户上传的文件写进 `public/`**（部署会覆盖），一律走 `src/lib/storage.ts` 写 `data/uploads/`
- 禁止在页面组件里直连数据库
- 禁止绕过 `requireAdmin()` 写数据
- **禁止在公开路由里根据登录态改变渲染结果**（私密内容只能出现在 `/me/*`）
- **禁止在 `src/db/queries.ts` 里新增不带可见性过滤的查询函数**
- **禁止把私密条目的图片放进 `public/`**
- **禁止直接输出 `entries.url` 作为链接**（必须走 `/go/{slug}`）
- **禁止把「可检索、可筛选、进 SEO」的内容写死在 `src/tools/` 里**（标签、正文介绍、推荐位）——
  这些在数据库，后台可改。**允许且要求**写在工具目录 `meta.ts` 里的，只有给 registry 用的最小元数据：
  `{ slug, name, description, version, usesServer, needsWorker }`（定义见 [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) 4.2）。
  功能代码在 `src/tools/<slug>/`，加工具不改数据库结构
- **禁止把二维码上传到第三方图床**，也禁止压缩到 430px 以下
- **禁止把 `entry_branches` 的地址信息塞回 `entries.meta`**
- 禁止手改 `drizzle/` 下的迁移文件和 `src/components/ui/`
- 禁止新增 `pages/` 目录（这是 App Router 项目）
- 禁止修改 `pnpm-lock.yaml`（只通过 `pnpm add` 间接改）
- 禁止用 `dangerouslySetInnerHTML`（MDX 渲染除外）
