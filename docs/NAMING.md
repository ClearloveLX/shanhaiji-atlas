# 命名规范 — 山海集 Atlas

> 目的：让 AI 和人写出来的东西长得一样，减少 vibe coding 里「每次风格都不同」的问题。
> 核心原则：**URL、数据库 slug、代码标识符三者一一对应**，看到 `/tools/figma` 就知道
> 数据库里 `entries.slug = 'figma'`，组件里叫 `EntryCard`。

---

## 1. 项目 / 仓库 / 域名

| 项 | 值 | 说明 |
|---|---|---|
| 中文名 | 山海集 | 面向用户展示 |
| 英文名 | Atlas | 架构图、地图、图集之意 |
| 品牌定式 | `山海集 · Atlas` | 中间「·」+ 半角空格，不写「山海集Atlas」 |
| 仓库名 | `shanhaiji-atlas` | 全小写 kebab-case |
| 本地目录 | `shanhaiji-atlas` | 与仓库名完全一致 |
| 域名候选 | `shanhaiji.app` / `atlaslife.cn` | |
| npm 包名 | `shanhaiji-atlas` | package.json 的 `name` |
| systemd 服务名 | `atlas` | 服务器上只有一个服务 |
| Slogan | 万物皆可收录，一签就能找到 | |

**不要用**：`AtlasWeb`、`shanhaiji_atlas`、`ShanHaiJi`、`atlas-site`、`my-atlas`。

---

## 2. 目录命名

- 全小写，多词用 `-`，不加 `src-` / `app-` 之类前缀
- 用复数名词装集合：`scripts/` `docs/` `tests/`
- 按**职责**分组，不按**技术**分组（`card/` 而不是 `react-components/`）

固定目录（不要新增同义目录）：

```
data/  docs/  drizzle/  public/  scripts/  tests/
src/actions/  src/app/  src/components/  src/db/  src/hooks/  src/lib/  src/styles/  src/tools/  src/types/
```

`data/` 与 `public/` 的分工（**容易搞错，重点记**）：

| 目录 | 放什么 | 会不会被部署覆盖 |
|---|---|---|
| `public/` | **构建期**静态资源：favicon、og 兜底图 | ✅ 会，随代码更新 |
| `data/` | **运行时**产生的一切：数据库、上传的图片、备份 | ❌ **永不覆盖** |

### Next.js 特殊目录（不要改名）

| 目录 | 含义 |
|---|---|
| `(site)` | 前台路由组，不出现在 URL |
| `(admin)` | 后台路由组，不出现在 URL |
| `[slug]` | 单个条目 |
| `[id]` | 数据库主键（后台编辑页用） |
| `[dim]` | 标签维度（scene / attr / …） |
| `[...nextauth]` | Auth.js 通配路由 |
| `feed.xml` | 用 `route.ts` 输出 XML |

### 后台路由约定

| 路径 | 作用 |
|---|---|
| `/admin` | 仪表盘 |
| `/admin/entries` | 条目列表（搜索/筛选/批量） |
| `/admin/entries/new` | 新建 |
| `/admin/entries/[id]/edit` | 编辑（**用 id 不用 slug**，因为 slug 可改） |
| `/admin/tags` | 标签管理 |
| `/admin/submissions` | 投稿审核 |
| `/admin/trash` | 回收站 |
| `/admin/imports` | 导入导出 |
| `/admin/settings` | 站点设置 |

---

## 3. 文件命名

| 类型 | 规则 | 正例 | 反例 |
|---|---|---|---|
| React 组件 | `PascalCase.tsx` | `EntryCard.tsx` | `entry-card.tsx` |
| 同目录子组件 | 主组件名前缀 | `EntryFormFields.tsx` | `Fields.tsx` |
| Server Action | 领域名词，复数 | `entries.ts` `tags.ts` | `entryActions.ts` |
| Hook | `use-xxx.ts` | `use-tag-filter.ts` | `useTagFilter.ts` |
| 工具函数 | `kebab-case.ts` | `site-config.ts` | `siteConfig.ts` |
| 数据库 | 固定文件名 | `schema.ts` `index.ts` `queries.ts` `seed.ts` `migrate.ts` | `dbSchema.ts` |
| 脚本 | `kebab-case.ts` / `.sh` | `link-check.ts` `backup.sh` | `checkLinks.mjs` |
| 文档 | 全大写 `-` 连接 `.md` | `CONTENT-GUIDE.md` | `contentGuide.md` |
| 迁移 | 由 drizzle-kit 生成，**不要改名** | `0000_init.sql` | — |

**一个文件一个默认导出**（组件）。具名导出只用于 `lib/` 与 `actions/`。

---

## 4. 代码内命名

| 对象 | 规则 | 示例 |
|---|---|---|
| 组件 | `PascalCase` | `EntryForm` `FilterPanel` |
| 函数 / 变量 | `camelCase` | `getEntries` `activeTags` |
| Server Action | 动词开头，`camelCase` | `createEntry` `mergeTags` `bulkDelete` |
| 常量 | `SCREAMING_SNAKE_CASE` | `MAX_TAGS_PER_DIM` `PAGE_SIZE` |
| 类型 / 接口 | `PascalCase`，**不加 `I` 前缀** | `Entry` `Tag` `EntryInput` |
| Zod schema | 同名 + `Schema` 后缀 | `entryInputSchema` |
| Zod 推导类型 | 同名无后缀 | `type EntryInput = z.infer<typeof entryInputSchema>` |
| 枚举值 | 小写字符串联合，**不用 TS `enum`** | `type EntryType = 'tool' \| 'site' \| 'shop'` |
| 事件处理器 | `handleXxx` / `onXxx` | `handleTagToggle` / `onTagToggle` |
| 布尔值 | `is` / `has` / `can` / `need` 前缀 | `isFeatured` `hasProxy` `needLogin` |
| 异步函数 | 动词开头 | `fetchEntries` `buildTagTree` |
| 缓存标签 | 名词，复数 | `'entries'` `'tags'` |

**禁止**：拼音命名（`shouye`）、无意义缩写（`e` `d` `tmp2`）、中文标识符、`data2` `newData`。

---

## 5. 数据库命名

| 对象 | 规则 | 示例 |
|---|---|---|
| 表名 | 复数 `snake_case` | `entries` `tags` `entry_tags` `submissions` `link_checks` `settings` |
| 列名 | `snake_case` | `name_en` `created_at` `last_checked_at` `deleted_at` |
| 主键 | 一律 `id`，类型 `uuid` | |
| 外键 | `{单数表名}_id` | `entry_id` `tag_id` |
| 中间表 | `{表A单数}_{表B复数}` | `entry_tags` |
| 索引 | `{表}_{列}_idx` | `entries_type_status_idx` |
| 唯一约束 | `{表}_{列}_uniq` | `tags_dim_slug_uniq` |
| 布尔列 | `is_` 前缀或形容词 | `is_featured`（或直接 `featured`，本项目用后者） |
| 软删除 | `deleted_at timestamptz`，NULL 表示未删 | 所有查询默认 `is null` |
| 时间列 | 一律 `timestamptz`，默认 `now()` | |

**Drizzle 里 TS 变量用 camelCase，数据库列用 snake_case**，靠 `varchar('name_en')` 显式指定列名，
不要依赖自动转换。

**迁移规则**：改 `schema.ts` → `pnpm db:generate` → 检查生成的 SQL → `pnpm db:migrate`。
**永远不要手改 `drizzle/` 下的文件，也永远不要手写 SQL 迁移。**

---

## 6. slug 与 URL

| 页面 | URL |
|---|---|
| 首页 | `/` |
| 列表 | `/tools` `/sites` `/shops` |
| 详情 | `/tools/figma` |
| 标签总览 | `/tags` |
| 标签页 | `/tags/scene/work`、`/tags/attr/no-login` |
| 搜索 | `/search?q=图片压缩` |
| 多值筛选 | `/tools?scene=work,study&platform=web` |
| 投稿 | `/submit` |
| 后台 | `/admin/...` |
| RSS | `/feed.xml` |

- `entries.slug` 只允许 `[a-z0-9-]`，不以 `-` 开头结尾，不含连续 `--`
- 中文条目的 slug 用**英文名或拼音**：✓ `xiaohongshu` ✗ `小红书` ✗ `xiao-hong-shu`
- slug 在**同类型内**唯一（数据库层面建 `(type, slug)` 唯一索引）
- **重命名 slug 视为破坏性变更**：后台要提示「该链接可能已被收藏或收录」，
  并在 `/etc/caddy/Caddyfile` 里加一条 301（在 `handle` 块最前面写 `redir`）。
- URL 全小写、不带尾斜杠
- 多值 query 用**英文逗号**，不用 `+` 或重复 key
- query 参数名 = 标签维度（`scene` `attr` `platform` `price`）
- 排序参数 `sort=newest|name|featured`，默认 `newest` 时不出现在 URL
- 分页 `page`，第 1 页不出现

---

## 7. 后台组件命名

| 组件 | 作用 |
|---|---|
| `DataTable` | 通用表格：排序 / 多选 / 分页 |
| `EntryForm` | 条目表单，新建与编辑共用 |
| `TagPicker` | 标签多选，可现场新建 |
| `IconUploader` | 上传或抓取 favicon |
| `StatusToggle` | 列表内直接切换状态 |
| `BulkActionBar` | 批量操作浮条 |
| `ConfirmDialog` | 危险操作二次确认 |
| `AdminSidebar` | 后台侧边栏 |

命名规律：**后台组件一律以「做什么」命名，不用「在哪里用」命名**
（`EntryForm` 而不是 `AdminEntryPageForm`）。

---

## 8. Git 规范

分支：`feat/` `fix/` `content/` `chore/` `docs/` `db/`

```
feat(admin): 条目列表支持批量打标签
fix(revalidate): 修改条目后标签页未刷新
db(entries): 增加 source 字段并生成迁移
content: 新增 12 条图片处理工具
chore(deps): 升级 next 到 15.2
docs(deploy): 补充从备份恢复的步骤
```

- 一次提交只做一件事
- **改了 `src/db/schema.ts` 必须把 `drizzle/` 下的迁移文件一起提交**，否则别人拉下来库是坏的
- 内容数据**不进 Git**（在数据库里），只有代码和迁移进 Git
- 备份文件（`data/`）必须在 `.gitignore` 里

---

## 9. 图片与静态资源

```
data/uploads/public/icons/{slug}.png      # 条目图标，128x128 正方形，文件名跟随条目 slug
data/uploads/public/qrcodes/{slug}-{n}.png # 二维码原图，≥430px，不压缩
data/uploads/public/covers/{slug}.webp    # 封面图，宽 800
data/uploads/private/{entryId}/...        # ★ 私密条目的图片，不在任何静态目录下

public/og/default.png                     # 分享图兜底 1200x630（构建期资源）
app/public/favicon.ico                    # 站点图标（构建期资源）
```

URL 对应关系：

| 存储位置 | 访问 URL | 鉴权 | 谁来服务 |
|---|---|---|---|
| `data/uploads/public/**` | `/media/{kind}/{filename}` | 无 | **Caddy file_server 直接读盘**，不经 Node |
| `data/uploads/private/**` | `/api/file/{entryId}/{filename}` | `requireAdmin()` | Node 路由 |

- 文件名跟随条目 slug（`figma.png` 而不是 `www.figma.com.png`）
- 图片由后台 `IconUploader` / `QrcodeManager` 上传或抓取，
  **不要手工往这些目录里丢文件**，统一走 `src/lib/storage.ts`
- 站内**禁止**引用第三方域名的图片
- **绝对不要把上传的文件放进 `public/`** —— 部署时会整个被覆盖掉，
  这是这套「本地构建 + rsync 产物」部署方式下最容易踩的坑
