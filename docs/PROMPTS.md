# Vibe Coding 提示词全集 — 山海集 Atlas（动态可维护版）

> ## ⚠️ 历史归档 —— 记录的是当时的想法，**不是当前事实**
>
> 本文件是项目启动期（D0–D11）写给 AI 的提示词**原件**，保留原样以存证。
> 项目后来改过架构，**下面有多处已经作废，不要照做**。
>
> - **当前项目事实**以 [`DEPLOY.md`](DEPLOY.md)、[`SERVER-DEPLOY.md`](SERVER-DEPLOY.md)、[`DATA-MODEL.md`](DATA-MODEL.md) 为准。
> - **服务器事实**以运维目录下的 `部署事实基准.md` 为准（该文件在服务器运维工作区，**不在本仓库**）。
>
> ### 关于示例值（已脱敏）
>
> 本文件里的主机名、IP、内网地址、实例 ID、开发机绝对路径、内存/磁盘的精确数字**都已换成占位或约数**，
> 例如「可用内存约 1.2 GB」「约 32 GB 可用磁盘」「`你的项目目录`」。
> **实际部署请一律换成你自己的值**——这些数字只是当年那台机器的快照，不是规格要求。
>
> ### 已知作废 / 出错的地方（行号为**加本横幅前**的原文件编号）
>
> | 位置 | 当年写的 | 现在是什么 |
> |---|---|---|
> | `:1127` | 「安全组只开放 **22** / 80 / 443」 | SSH 端口后来**从 22 改掉了**。**别再用 22** —— 改成高位端口能挡掉绝大部分自动化扫描（但挡不住针对性扫描：改了端口之后仍有 IP 来敲门，真正的防线是仅公钥认证 + fail2ban）。<br>这个文件里不写具体端口号，**按你自己的实际端口替换**；安全组和 ufw 都要放行那一个端口 + 80 + 443 |
> | `:114`、`:189` | 「这四个 PRAGMA，一个都不能少」 | **五条**（`src/db/index.ts`）：`journal_mode` / `busy_timeout` / `synchronous` / `foreign_keys` / `cache_size` |
> | `:394` | 「platform 最多 3 个」 | **platform 6 个**（`src/lib/validation.ts` 的 `MAX_TAGS_PER_DIM`）。同句的 topic 3 / scene 3 / attr 4 / price 1 / quality 2 **是对的** |
> | `:495` | 「检查 N 条，正常 x / **警告 y** / 失败 z」 | 只有**两档**：`正常 / 失败`，**没有「警告」**（`scripts/link-check.ts`） |
> | `:679` | 「每天有一次**自动任务**把 `expires_at < now()` 置为 `is_active=false`」 | **没有自动任务**。要自己配 crontab 调 `/api/cron/qrcodes`（见 `DEPLOY.md` §6.5）；没配 cron 就不会自动发生，后台还有「一键停用所有已过期的码」按钮 |
> | `:242`、`:999` | 部署方式写成「**rsync 覆盖 `app/`**」；「`app/public/` 里只剩 favicon、og 兜底图」 | 本机**没有 rsync**，现在是 **tar.gz + SFTP**；`public/` **是空的**，favicon 在 `src/app/favicon.ico`，分享图是动态路由 `src/app/og/route.tsx`，不在 `public/og/` |
> | `:1042`、`:1045-1048`、`:1055`、`:1061-1074` | 整段 rsync 发布流程；`--exclude "node_modules/better-sqlite3"`；`invalid ELF header`；「服务器上补装 better-sqlite3」；「折腾不动就切方案 B」 | **全部作废**。`better-sqlite3` **v13 已改用 N-API 预编译包**（npm 包内直接带 8 个平台的 `prebuilds/*.node`，没有 `build/Release/`），**不绑 Node ABI** —— Windows 构建产物**直接能在 Linux 跑**，不需要 exclude、不需要服务器补装、不需要切方案 B |
>
> **仍然有效、可以照做的部分**：`output: 'standalone'` + 原生 Node + Caddy + systemd 的部署形态；
> `releases/` 与 `data/` 分离、`current` 软链、永不在 `current/` 里构建；
> 「上传文件一律进 `data/uploads/`，绝不进 `public/`」这条铁律；`next.config.ts` 里的 `serverExternalPackages: ['better-sqlite3']`。

> 用法：按顺序把每段代码块**原样**粘给 AI 编码助手（Cursor / Claude Code / Codex / Windsurf 都行）。
> 一次只发一段，等它自检完、报完结果，再发下一段。
> 每段末尾的「验收」是你要亲自检查的点，不通过就把报错原文贴回去。

**这套提示词的前提**：项目是**数据库驱动 + `/admin` 后台**的。
维护意味着「打开后台点几下」，不是「改 JSON 再重新构建」。
任何一步 AI 提议 `output: 'export'`、把数据放进 Markdown/JSON、或让你手工改文件加内容——**拒绝，让它按 D0 的架构重做**。

---

## D-1 · 常驻规则（把 `AGENTS.md` 全文粘上）

见根目录 [`AGENTS.md`](../AGENTS.md)。这段不用手打，保证文件在项目根目录即可。
用 Cursor 就复制一份到 `.cursor/rules/atlas.mdc`，用 Windsurf 就复制成 `.windsurfrules`，内容保持一致。

---

## D0 · 项目初始化（全栈，不是静态导出）

```text
初始化「山海集 Atlas」项目。这是一个**全栈动态站**，有数据库和后台管理界面。

⚠️ 重要：绝对不要使用 output: 'export'。这个项目必须能读写数据库，
   不要把它做成静态站，不要用 Markdown/JSON 文件存内容。

当前项目目录 shanhaiji-atlas 里已有 docs/、AGENTS.md、README.md 三个东西，
**这三个都不能删**（AGENTS.md 是常驻规则，docs/ 是设计和提示词，README.md 是项目说明）。

【1】创建项目
pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack --skip-install
pnpm install

⚠️ 如果报「目录非空 / 已存在文件」：
   1. 把 AGENTS.md 和 README.md 临时移到 你的项目父目录 下
   2. 跑 create-next-app（docs/ 在它的白名单里，不会冲突）
   3. 把 AGENTS.md 移回来覆盖脚手架生成的同名文件（AGENTS.md 脚手架不会生成，直接放回）
   4. README.md 脚手架会生成一份通用的，**先把它另存为 README-scaffold.md 备查**，
      再把我们的 README.md 移回来，最后删掉 README-scaffold.md
   5. 确认 docs/ 下 7 个 md 文件都还在
   做完这五步再继续，不要跳过任何一个。

【2】安装依赖
pnpm add drizzle-orm better-sqlite3 next-auth@beta @auth/drizzle-adapter bcryptjs zod lucide-react clsx tailwind-merge next-themes nanoid
pnpm add -D drizzle-kit @types/better-sqlite3 tsx dotenv-cli

⚠️ 用的是 better-sqlite3（原生模块），不是 postgres。这个项目不用 PostgreSQL、不用 Docker。
   next.config.ts 里必须加 serverExternalPackages: ['better-sqlite3']，
   否则 Next 会试图把原生模块打进 bundle 并报错。

【3】shadcn/ui
pnpm dlx shadcn@latest init        # new-york / neutral / CSS 变量
pnpm dlx shadcn@latest add button input label card badge select table dialog sheet tabs separator skeleton tooltip dropdown-menu popover command sonner alert-dialog checkbox switch textarea form pagination breadcrumb avatar
确保 globals.css 最终只有 src/styles/globals.css 一份，由 layout 通过 import '@/styles/globals.css' 引入。

【4】next.config.ts
export default {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],   // ★ 原生模块必须外部化
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
}
不要加任何其它选项。**不要写 output: 'export'**。

【5】端口（PORT-RULES 已分配，禁止用默认 3000）
package.json scripts：
  "dev": "next dev -p 4000",
  "build": "next build",
  "start": "next start -p 4000",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx src/db/migrate.ts",
  "db:seed": "tsx src/db/seed.ts",
  "db:studio": "drizzle-kit studio --port 4001",
  "db:reset": "tsx src/db/reset.ts",
  "backup": "bash scripts/backup.sh",
  "check-links": "tsx scripts/link-check.ts"

【6】.env.example 与 .env.local
DATABASE_PATH=./data/atlas.db          # ★ SQLite，不是 DATABASE_URL
UPLOAD_DIR=./data/uploads
AUTH_SECRET=（用 openssl rand -base64 32 生成一个填进去）
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=（明文只用于首次 seed，seed 时 bcrypt 哈希后写库）
NEXT_PUBLIC_SITE_URL=http://localhost:4000
CRON_TOKEN=（随便一串随机字符，用于 /api/cron/* 的鉴权）
TZ=Asia/Shanghai
生成 .env.local 并填入可用的本地值。.gitignore 必须包含 .env*.local 和 data/

【7】目录骨架（空目录放 .gitkeep）
data/  data/uploads/public/{icons,qrcodes,covers}  data/uploads/private  data/backups
docs/  public/  scripts/  tests/
src/app/(site)/  src/app/(admin)/admin/{entries/new,entries/[id]/edit,tags,submissions,trash,imports,settings}
src/app/(admin)/me/
src/app/api/auth/[...nextauth]/  src/app/api/file/[...path]/  src/app/api/cron/link-check/
src/actions/  src/db/  src/hooks/  src/lib/  src/styles/  src/types/  src/tools/
src/components/{ui,admin,card,filter,search,layout}
注意：**不要建 docker/ 目录**，这个项目不用 Docker。

【8】src/lib/site-config.ts
集中导出：name '山海集'、nameEn 'Atlas'、slogan '万物皆可收录，一签就能找到'、
description、locale 'zh-CN'、nav 数组（首页/工具/站点/店铺/标签）。
其它文件一律从这里读，禁止硬编码站名。

【9】src/styles/globals.css 主题变量（只改变量，别写自定义 class）
--primary #2F6B6B，--background #FFFFFF，--muted #F7F5F0，--foreground #1F2421，--radius 0.75rem
深色模式一套对应值，深色背景 #14171A
中文字体栈：ui-sans-serif, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif

【10】src/db/index.ts（SQLite，不用 Docker、不用 PostgreSQL）
用 better-sqlite3 建连接：路径从 process.env.DATABASE_PATH 读，本地默认 ./data/atlas.db，
上级目录不存在就自动创建。
**建连接后立刻执行这四个 PRAGMA，一个都不能少**：
  journal_mode = WAL       -- 允许读写并发；默认的 rollback 模式会锁整库
  busy_timeout = 5000      -- 写冲突时等 5 秒而不是直接抛 SQLITE_BUSY
  synchronous = NORMAL     -- WAL 模式下安全，且比 FULL 快很多
  foreign_keys = ON        -- 默认居然是关的，外键约束不生效
再加 cache_size = -16000（16 MB 页缓存）。
导出 db（drizzle 实例）和 sqlite（原始连接，仅迁移和健康检查用）。
开发模式下挂到 globalThis 防止热重载重复开库。
data/ 要加进 .gitignore。

【11】跑起来验证
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm lint && pnpm typecheck && pnpm build
pnpm dev

完成后告诉我：data/atlas.db 文件生成了吗、build 是否成功、http://localhost:4000 首屏能看到什么。
任何一步报错先自己修，修不好把完整报错贴给我。
```

**验收**：`next.config.ts` 里**没有** `output: 'export'`、**有** `serverExternalPackages: ['better-sqlite3']`；`pnpm build` 通过；`data/atlas.db` 文件已生成。

---

## D1 · 数据库模型与迁移

```text
建立数据库层。这是整个项目的地基，字段名严格按下面写，不要自己发挥。

【1】src/db/schema.ts —— Drizzle 表定义

★★★ 完整可用的 Drizzle 代码在 **docs/DATA-MODEL.md 第二节**。
    **先完整读一遍那个文件，然后照抄它的代码，不要自己凭记忆写、不要自己发挥。**
    （如果项目已经建好，`src/db/schema.ts` 已是权威，以那个文件为准。）

⚠️ 这是 **SQLite** 项目，用 `drizzle-orm/sqlite-core`，不是 pg-core。
   不允许出现 `pgTable` / `uuid()` / `varchar()` / `jsonb` / `timestamptz` /
   `defaultRandom()` / `defaultNow()` / `bigserial` —— 这些在 sqlite-core 里编译不过。
   类型映射表见 DATA-MODEL.md 第 2.0 节。

必须存在的 11 张表（照抄 DATA-MODEL.md，写完后逐条打勾）：

  □ entries          主表：type / linkMode / visibility / slug / name / summary / url /
                     icon / cover / note / meta / featured / status / sortWeight /
                     viewCount / clickCount / 三个时间戳 / deletedAt
  □ entry_tools      自研工具 1:1：component / runtime / requiresLogin / version / usageCount / changelog
  □ entry_branches   线下门店 1:N：address / city / lat / lng / poiSource / poiId / phone /
                     hours / priceLevel / isPrimary / sort / status
  □ entry_qrcodes    二维码 1:N：label / kind / image / tip / **expiresAt** / isActive / showCount / sort
  □ entry_private    站长私密字段 1:1：rating / status / note / contact / paid / visitedOn
  □ tags             标签字典：dim / slug / name / color / icon / desc / sort，唯一 (dim, slug)
  □ entry_tags       条目↔标签多对多，复合主键
  □ submissions      访客投稿：name / url / type / reason / contact / status / resultId / ipHash
  □ link_checks      死链巡检历史：entryId / statusCode / ok / error / checkedAt
  □ click_logs       点击统计**按天聚合**：复合主键 (entryId, day)，count
  □ settings         键值配置：key / value(json) / updatedAt

写完后必须逐条自查：
  - 全文 grep 一遍 `pgTable|jsonb|timestamptz|varchar(|defaultRandom|defaultNow`，必须 0 命中
  - 时间戳一律 `integer(..., { mode: 'timestamp_ms' })`，默认值用 `$defaultFn(() => new Date())`
  - 主键一律 `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())`
  - 布尔一律 `integer(..., { mode: 'boolean' })`，不要裸 0/1
  - `click_logs.day` 和 `entry_private.visited_on` 用 `text` 存 'YYYY-MM-DD'

关键约束（Zod 校验 + 服务端强制，不是数据库 CHECK）：
  link_mode='external' → url 非空且合法
  link_mode='internal' → url 为空，且 component 必须能在 src/tools/registry.ts 里找到
  link_mode='place'    → 必须至少有 1 条 entry_branches

搜索注意：**不要用 pg_trgm**（那是 Postgres 的东西）。条目量在几千以内，
直接用 `LIKE '%关键词%'` 就够快（几毫秒），不要上 FTS5。

字段语义的说明（为什么这么设计、哪些字段不能塞进 `meta`）在 DATA-MODEL.md 各小节里，
**读一遍再动手**。

【2】src/db/index.ts
（D0 的第 10 步已经建过，这里确认一遍）better-sqlite3 连接 + 四个 PRAGMA。
导出 db（drizzle 实例）和 sqlite（原始连接，仅迁移和健康检查用）。

【3】drizzle.config.ts
dialect: 'sqlite'，schema: './src/db/schema.ts'，out: './drizzle'，
dbCredentials.url 从 process.env.DATABASE_PATH 读（用 dotenv-cli 或在 config 里手动 loadEnv）。
生成的迁移是 .sql 文件，放在 drizzle/ 下，**要提交进 Git**（否则别人拉下来库是坏的）。

【4】src/db/migrate.ts
一个 tsx 脚本，用 drizzle-orm/better-sqlite3/migrator 的 migrate() 执行 drizzle/ 下的迁移。
输出「已应用 N 个迁移」或「数据库已是最新」。

【5】src/db/seed.ts
a. 灌入完整的标签字典（见 docs/TAGS.md，12 个 scene + 8 个 attr + 6 个 platform + 4 个 price + 4 个 quality），
   每个标签带 name / color / icon（lucide 真实组件名，自己核对）/ desc（30-60 字，认真写） / sort。
   颜色要保证白底上 WCAG AA 对比度。
b. 用 ADMIN_EMAIL / ADMIN_PASSWORD 环境变量创建管理员账号，密码 bcrypt 哈希后存进 settings 表，
   key 用 'admin'，value 是 { email, passwordHash }。明文密码绝不入库、绝不进日志。
c. 插入 36 条示例条目（工具/站点/店铺各 12 条，用真实存在的产品），
   覆盖至少 8 个不同 scene，至少 5 条 featured + editor-pick 标签。
   summary 用正常中文写，说清「是什么 + 适合谁」，不要写废话。
d. 脚本要幂等：重复跑不报错，用 slug 判断已存在就跳过。
e. 结尾打印统计：标签 N 个，条目 M 条（工具 x / 站点 y / 店铺 z），管理员账号已就绪。

【6】src/db/reset.ts
开发用：清空所有表后重跑 seed。执行前要求输入 yes 确认。

【7】src/lib/validation.ts
用 Zod 定义与上面表结构严格对应的 schema：
entryInputSchema（表单用，不含 id/时间戳/deleted_at）、tagInputSchema、submissionInputSchema、
以及从 schema 推导的类型。tags 字段在表单里是一个整体：{ scene: string[], attr: string[], ... }，
保存到数据库时再拆成 entry_tags 关联。

【8】★ src/lib/storage.ts —— 现在就定下来，后面所有上传都走它
（这一步必须在这里做，不能拖到部署那一步。原因见下面。）

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './data/uploads'

导出三个函数：
  putObject({ kind, filename, buffer, visibility })  →  返回可访问的 URL
  deleteObject(url)
  resolveLocalPath(url)                              →  给读取路由用

目录与 URL 的对应关系（**写死在这里，全项目只有这一处知道**）：

  visibility='public'  →  data/uploads/public/{kind}/{filename}
                          返回 URL: /media/{kind}/{filename}
  visibility='private' →  data/uploads/private/{entryId}/{filename}
                          返回 URL: /api/file/{entryId}/{filename}

kind 取值：icons | qrcodes | covers

⚠️ 为什么必须现在就做：
   部署方式是「本地构建 → rsync 覆盖 app/」，所以 app/public/ 每次发布会整个被替换掉。
   **任何写进 public/ 的上传文件都会在下次部署时消失。**
   所以从第一次写上传功能起就要用 data/uploads/，不要先写 public/ 以后再改。

⚠️ 还必须建两个读取路由（本地开发没有 Caddy，靠它们兜底）：
   src/app/media/[...path]/route.ts
     只读 data/uploads/public，解析后路径必须以它开头（防目录穿越），否则 400
     响应头 Cache-Control: public, max-age=31536000, immutable
     生产环境这个路由会被 Caddy 的 handle /media/* 抢先接管，不会执行
   src/app/api/file/[...path]/route.ts
     await requireAdmin()，不登录 401
     只读 data/uploads/private
     响应头 Cache-Control: private, max-age=0, no-store + X-Robots-Tag: noindex, nofollow
     （原理见 docs/PRIVACY.md 第二节铁律 3）

同时把 UPLOAD_DIR 写进 .env.example 和 .gitignore（data/ 整个忽略）。

完成后依次跑：
pnpm db:generate && pnpm db:migrate && pnpm db:seed
把每一步的输出贴给我，并确认 drizzle/ 下生成了迁移 SQL 文件。
```

**验收**：`pnpm db:studio`（端口 4001）能看到全部表结构和种子数据；`pnpm db:seed` 重复跑不报错；`src/lib/storage.ts` 存在且 `data/uploads/{public,private}` 目录已建。

---

## D2 · 认证与后台骨架

```text
搭建登录和后台框架。后台是这个项目最主要的界面，实用优先。

【1】src/lib/auth.ts —— Auth.js v5
- Credentials Provider：邮箱 + 密码，去 settings 表读 'admin' 那条记录比对 bcrypt 哈希
- session 策略用 'jwt'，maxAge 30 天
- callbacks.authorized：只有 session 存在才放行 /admin
- 导出 { handlers, auth, signIn, signOut }
- 再导出一个 requireAdmin()：内部调 auth()，没有 session 就 redirect('/login')，
  返回 session。所有写数据的 Server Action 第一行都要调它。
- 登录失败统一返回「邮箱或密码不正确」，不要区分是哪个错，失败时 sleep 500ms 防暴力破解

【2】src/app/api/auth/[...nextauth]/route.ts
export const { GET, POST } = handlers

【3】src/middleware.ts
matcher 只匹配 '/admin/:path*'，未登录跳 /login?from={原路径}。
不要在 middleware 里连数据库（Edge runtime 跑不了 better-sqlite3 这种原生模块）。

【4】src/app/login/page.tsx
居中的极简登录卡片：站名 + 邮箱输入 + 密码输入 + 登录按钮。
用 Server Action 提交，失败时在表单上方显示错误，成功后跳 from 参数指定的路径或 /admin。
不要做注册入口、不要做找回密码（单管理员，忘了就改 .env 重跑 seed）。

【5】src/app/(admin)/admin/layout.tsx
左侧固定侧边栏（宽 220px，移动端收成顶部抽屉），菜单项：
  仪表盘 /admin
  条目管理 /admin/entries
  标签管理 /admin/tags
  投稿审核 /admin/submissions   （有 pending 时显示红点数字）
  回收站 /admin/trash
  导入导出 /admin/imports
  站点设置 /admin/settings
顶部一条细栏：左侧面包屑，右侧「查看前台」链接（新标签页打开 /）+ 退出登录按钮。
后台整体用中性灰调，圆角 8px，信息密度高，**不要用主色大面积铺色**。

【6】src/app/(admin)/admin/page.tsx 仪表盘
四张数字卡：总收录 / 本月新增 / 待审投稿 / 疑似失效
下面两块：
- 最近更新的 8 条条目（名字 + 类型 + 更新时间，点击进编辑页）
- 最近 5 条死链巡检失败记录（条目名 + 状态码 + 时间，点击进编辑页）
数据从 src/db/queries.ts 取，不要在这里写 db.select。

【7】src/db/queries.ts 建立读查询层
每个查询函数都必须：
- 用 unstable_cache 包一层，指定 keyParts 和 tags（'entries' 或 'tags'）
- 自动过滤 deleted_at is not null 的记录（除后台列表和回收站）
导出：getEntries({ type?, status?, scene?, keyword?, page, pageSize, sort })、
getEntryBySlug(type, slug)、getEntryById(id)、getFeatured(limit)、
getTagsByDim(dim)、getTagTreeWithCount()、getDashboardStats()、
getSubmissions({ status, page })、getEntriesForSitemap()

【8】src/lib/revalidate.ts —— ★ 这个文件很重要
导出 revalidateEntryPaths(entry)：
  依次 revalidatePath('/', 'page')、revalidatePath(`/${type}s`)、
  revalidatePath(`/${type}s/${slug}`)、如果改了标签还要 revalidatePath('/tags') 
  以及 revalidatePath(`/tags/${dim}/${tagSlug}`)、最后 revalidateTag('entries')
再导出 revalidateTagPaths(tag)：改标签时刷新 /tags 和该标签页。
所有写库的 Action 结尾都必须调它，否则前台看不到更新——这是本项目最容易出的 bug。

完成后跑 pnpm build && pnpm dev，然后：
- 访问 /admin 应该被跳到 /login
- 用 seed 时的账号登录，能进仪表盘
- 未登录时直接访问 /admin/entries 也要被拦
把验证结果告诉我。
```

**验收**：未登录访问 `/admin/*` 全部被拦；登录后仪表盘四张数字卡有真实数据。

---

## D3 · 后台内容管理（维护核心，最重要的一段）

```text
实现条目管理。这是日常用得最多的界面，请把体验做好，不要只做出「能用」。

【1】src/components/admin/EntryForm.tsx（新建与编辑共用，客户端组件）

★ 第一步是「形态选择」，这一步决定后面显示哪些字段。**这是后台可用性的关键，不要偷懒做成一个大表单。**

新建时先只显示三个大按钮（单选）：
  ○ 外部链接 —— 推荐一个别人做的东西（网站、工具、网店）
  ○ 自研工具 —— 我自己做的，跑在站内
  ○ 线下好店 —— 有实体地址的店
选定后写入 link_mode（external / internal / place），只渲染该形态需要的字段。
编辑时 link_mode 显示为只读徽章（改形态等于重建，不允许直接改）。

三种形态各自的字段：

【external 外部链接】
- 类型（tool/site/shop）单选
- 中文名（必填，1-30 字）
- slug（必填，[a-z0-9-]，旁边有「根据名字生成」按钮；编辑时若改变已有 slug 要警告「旧链接会失效」）
- 英文名（选填）
- 一句话简介（必填，20-60 字，实时字数提示，不足/超出变红）
- 链接 URL（必填，校验 http(s)，**失焦时自动抓一次该域名的 favicon 供选择**）
- 图标、封面图
- 标签（见下）
- 编辑手记 note
- 精选开关、状态、排序权重

【internal 自研工具】
- 类型固定 tool（不显示选择器）
- 名称 / slug / 英文名 / 简介 —— 同上
- **组件名**：下拉选择，选项从 src/tools/registry.ts 导出（服务端读文件列出所有已注册 slug），
  旁边显示「该组件已注册 ✓」或「未注册 ✗」；不要做成自由文本输入
- 运行时（client / server，一般选 client）
- 版本号、是否需要登录
- 图标、封面图、标签、编辑手记、精选、状态

【place 线下好店】
- 类型固定 shop
- 名称 / slug / 英文名 / 简介 —— 同上
- **门店列表**（可增删，至少 1 条）：
  门店名（选填，如「静安寺店」）/ 地址（必填）/ 省市区（填地址后自动解析，可手改）/
  电话 / 营业时间 / 价位（1-3）/ 是否主门店
  地址填写时：失焦调用服务端 Server Action 做地理编码，回填 lat/lng/poiId，
  并在下方嵌入高德静态地图显示一个**可拖拽的标记**让人工确认位置
  （API 经常定到马路对面，必须能手动纠正）
- **二维码**（可增删）：见 D6 的 QrcodeManager
- 封面图、标签、编辑手记、精选、状态

公共部分：
- 标签：TagPicker，按维度分组多选，每个维度显示已选数量，
  scene 必选且最多 3 个，attr 最多 4 个，platform 最多 3 个，price 最多 1 个，quality 最多 2 个
  没有想要的标签时可以直接在输入框里回车新建（即时写 tags 表并自动选中）

交互要求：
- 表单用 react-hook-form + shadcn Form（zodResolver 用 src/lib/validation.ts 的 entryInputSchema）
- 有未保存改动时关闭/跳转要弹确认（用 use-unsaved-warning）
- 提交按钮 loading 态，成功后 toast「已保存」，**留在原页**（新建成功后跳到编辑页）
- 保存失败时把 Zod 的具体错误显示到对应字段上，不要只弹一句「保存失败」

【2】src/actions/entries.ts
createEntry(input) / updateEntry(id, input) / softDeleteEntry(id) / restoreEntry(id) /
toggleFeatured(id) / setStatus(id, status) / bulkTag(ids, dim, tagIds, mode: 'add'|'remove') /
bulkSetStatus(ids, status) / bulkDelete(ids)
每个函数：
- 第一行 await requireAdmin()
- 用 entryInputSchema 校验
- 写库后调 revalidateEntryPaths
- 返回 { ok: true, data } 或 { ok: false, error: '中文错误信息' }
- slug 冲突时返回明确错误：「slug "figma" 已被占用，请换一个」

【3】src/components/admin/DataTable.tsx（通用表格）
泛型组件，props：columns、data、排序、行选择、分页。
用原生 <table> + Tailwind，不要装表格库。
功能：列头点击排序、复选框多选（含全选）、当前页/全部页选择、底部页码。

【4】/admin/entries/page.tsx 条目列表
- 顶部工具条：关键字搜索（搜 name / url / summary，防抖 300ms）+ 类型筛选 + 状态筛选
  + 标签筛选（点开弹出 TagPicker）+ 排序 + 「新建条目」按钮
- 表格列：复选框 / 图标 / 名称（含 slug 小字）/ 类型 / 标签 chips / 状态 / 精选 / 更新时间 / 操作
- **状态和精选在表格里直接可切换**（点击即改，不用进编辑页），切换后行内即时反馈
- 操作列：编辑 / 查看前台 / 删除（软删除，二次确认）
- 有勾选时底部浮出 BulkActionBar：批量打标签 / 批量改状态 / 批量删除 / 已选 N 条
- 分页每页 50 条，筛选和分页状态写进 URL query（刷新和分享链接结果一致）
- 全部筛选在服务端做（查数据库），不要把 5000 条数据全传到前端再筛

【5】/admin/entries/new/page.tsx 与 /admin/entries/[id]/edit/page.tsx
分别渲染 EntryForm 的新建/编辑模式。编辑页顶部显示「最后更新于 X」和「查看前台」链接。

【6】/admin/trash/page.tsx 回收站
列出 deleted_at 非空的条目，支持单条恢复和彻底删除（彻底删除要输入条目名确认）。

【7】/admin/imports/page.tsx 导入导出
- 「导出全站 JSON」按钮：把所有条目（含标签）导成一个 JSON 文件下载，文件名带日期
- 「导出 CSV」按钮：方便用 Excel 批量编辑
- 导入区：粘贴 JSON 或上传文件，先**预检**并在页面上显示「新增 N 条 / 更新 M 条 / 冲突 K 条」
  的明细表，确认后才真正写库；冲突时提供「跳过 / 覆盖 / 生成新 slug」三个选项
- 每次导入前自动把当前全站数据导一份到 scripts/backups/ 作为回滚点

完成后验证并告诉我：
- 新建一条条目，前台 /tools/{slug} 是否**立刻**能看到（不需要重启 dev server）
- 改一条条目的精选开关，首页精选区是否立刻更新
- 批量给 3 条打同一个标签，标签页计数是否 +3
- 删除一条，前台消失、回收站出现、恢复后前台回来
```

**验收**：四条验证全过。**特别是第一条**——如果需要重启才看到更新，说明 `revalidatePath` 没接对，让 AI 修。

---

## D4 · 标签管理、投稿审核、定时巡检

```text
【1】/admin/tags/page.tsx 标签管理
- 按维度分 Tab（场景/属性/平台/价格/质量），每个 Tab 里是该维度的标签表格
- 表格列：颜色圆点 / 名称 / slug / 描述 / 条目数 / 排序值 / 操作
- 行内可直接编辑：名称、颜色（取色器）、图标、描述、排序值 —— 改完失焦即保存
- 「新建标签」按钮，弹表单，slug 唯一性校验
- 行内展开显示该标签下的条目列表（前 10 条），方便判断这个标签用得对不对
- **删除标签**：如果该标签下有条目，不允许直接删，弹窗提示「该标签被 N 条条目使用」，
  并给出两个选项：「批量改到另一个标签」或「仅从所有条目上移除这个标签」
- **合并标签**：选中 2 个以上同维度标签 → 「合并」→ 选择保留哪一个 →
  把所有引用改到保留的标签上，删除其余，整个过程在一个事务里

【2】src/actions/tags.ts
createTag / updateTag / deleteTag / mergeTags(sourceIds, targetId) / reorderTags(dim, orderedIds)
每个都 requireAdmin + Zod 校验 + 写完后 revalidateTagPaths。
mergeTags 必须用 db.transaction 包起来。

【3】/admin/submissions/page.tsx 投稿审核
- Tab：待审 / 已通过 / 已拒绝
- 每条显示：推荐名称（可点开原链接）/ URL / 推荐理由 / 联系方式 / 提交时间
- 操作：「通过」/「拒绝」/「查看原链接」
- 点「通过」时**不要直接建条目**，而是跳转到 /admin/entries/new 并把投稿内容预填进表单
  （用 URL query 传参），你确认补全标签后保存，同时把该投稿标记为 approved 并记录 result_id
- 点「拒绝」要选一个原因（链接失效 / 不符合收录标准 / 重复 / 垃圾信息），记录后该条移入已拒绝
- 顶部显示待审计数，超过 7 天未处理的标红

【4】访客投稿入口 src/app/(site)/submit/page.tsx
- 表单：推荐名称 / 链接 / 类型 / 推荐理由（20-300 字）/ 联系方式（选填）
- 提交走 Server Action 写入 submissions 表
- 简单防刷：同一 IP 哈希 24 小时内最多 5 条；加一个不需要 JS 的算术验证
- 提交成功后显示「已收到，通过后会出现在站内」，不要承诺具体时间
- 表单下方写清收录标准（真实可用、无强制弹窗、长期维护优先、不收录需安装来路不明客户端的站点）

【5】死链巡检 scripts/link-check.ts + /api/cron/link-check/route.ts
脚本逻辑：
- 查所有未删除条目，并发 10 请求（简单 promise pool，不要装 p-limit）
- HEAD 请求，8 秒超时；405/403 就回退 GET（只读 headers）
- 结果写入 link_checks 表，并更新 entries.last_checked_at
- 判定：连续 2 次失败的条目自动把 status 改成 'stale'（**不要自动改成 dead**，
  dead 由人工在后台确认，脚本只提示）
- 结尾打印：检查 N 条，正常 x / 警告 y / 失败 z，并列出失败条目名
route.ts：校验 header 里的 x-cron-token 等于 CRON_TOKEN，不匹配返回 401，
然后调用同一份逻辑（把核心逻辑抽到 src/lib/link-check.ts，脚本和 route 都调它）。

【6】后台侧边栏在「条目管理」旁显示疑似失效的数量红点，点进去是筛好 status=stale 的列表。

完成后跑一次 pnpm check-links，把输出贴给我。
```

**验收**：标签合并后所有条目和计数正确；投稿走完「提交 → 审核 → 预填 → 保存 → 标记已通过」全流程。

---

## D5 · 链接行为：外链跳转 + 自研工具运行页

```text
这一段处理「用户点了条目之后发生什么」。两种形态，一次做完。

════ 第一部分：外链跳转中间页 /go/[slug] ════

【1】src/app/go/[slug]/route.ts（Route Handler，不是页面）
- 按 slug 查 entries（忽略 deleted_at 非空的）
- 找不到 → 307 跳到一个提示页 /go/not-found?from={slug}
- status 为 'dead' → 307 跳到 /go/gone?from={slug}，那个页面显示
  「这个链接可能已经失效」+ 同类推荐 4 条 + 搜索框
- 正常情况：
  a. 异步写 click_logs：INSERT ... ON CONFLICT (entry_id, day)
     DO UPDATE SET count = click_logs.count + 1（用 waitUntil 或直接 await 但不要阻塞跳转）
  b. entries.click_count + 1（同一个事务里做，或干脆只维护 click_logs，click_count 定时汇总）
  c. 302 到 entries.url
- 响应头：Cache-Control: no-store，Referrer-Policy: no-referrer-when-downgrade
- **不要**做「3 秒后自动跳转」的中间页，直接 302，不要让用户等

【2】所有前台外链一律指向 /go/{slug}，不要直接输出 entries.url。
    包括卡片、详情页主按钮、相关推荐。
    必须是普通 <a href="/go/xxx">，不要用 JS 拦截 click——
    保证中键、Ctrl+点击、右键复制链接地址都正常工作。
    链接上加 rel="nofollow noopener"，target="_blank"。

【3】/admin/clicks 点击统计页
- 表格：条目名 / 类型 / 今日点击 / 近 7 天 / 近 30 天 / 总点击 / 趋势迷你柱状图
- 支持按时间范围筛选、按点击量排序
- 「近 30 天零点击」的条目单独列一个区块，提示「这些条目可能已经没人用了」——
  这是你决定要不要清理条目的依据

════ 第二部分：自研工具系统 ════

【4】src/tools/registry.ts —— 唯一注册处
export const TOOL_REGISTRY = {
  'qr-generator':   { load: () => import('./qr-generator') },
  'image-compressor': { load: () => import('./image-compressor') },
  'text-diff':      { load: () => import('./text-diff') },
} as const
export type ToolSlug = keyof typeof TOOL_REGISTRY
export const TOOL_SLUGS = Object.keys(TOOL_REGISTRY) as ToolSlug[]
注意：必须是静态 import 路径，不能用变量拼接，否则打包器会漏掉这些 chunk。

【5】每个工具一个目录，结构固定：
src/tools/{name}/
  index.tsx     默认导出工具组件，必须 'use client'
  meta.ts       默认导出 { slug, name, description, needsWorker?, usesServer?, version }
  worker.ts     可选，Web Worker
  lib/          该工具专属的纯函数

先做两个示例工具把架子跑通（选简单的，不要花太多时间在算法上）：
- qr-generator：输入文本 → 生成二维码 → 可下载 PNG。用 qrcode 这个包，**纯客户端生成**
- text-diff：左右两栏文本 → 高亮差异。用 diff 这个包，纯客户端
两个工具都要示范「纯前端、数据不出浏览器」，并在界面上明确写一行
「所有处理都在你的浏览器里完成，内容不会上传到服务器」——这是卖点。

【6】src/app/(site)/tools/[slug]/app/page.tsx —— 工具运行页
- Server Component 外壳：从数据库取 entry（取不到就 notFound），
  从 TOOL_REGISTRY 取组件，用 next/dynamic 懒加载
- 布局：**极窄容器（max-width 720px）**，顶部一条细栏：
  返回箭头（回详情页）/ 工具名 / 右侧「关于这个工具」链接
- **不要放全站导航、页脚、推荐位、广告位**。用工具的人只想干活。
- 底部一行小字：版本号 + 「所有处理都在本地完成」
- generateMetadata 从 entry 取 title/description（工具页也要能被搜到）
- 进入页面时打一次 usage_count + 1（Server Action 或 sendBeacon，不要阻塞渲染）

【7】src/app/(site)/tools/[slug]/page.tsx 详情页里
- link_mode 为 'internal' 时，主按钮是「打开工具」→ 站内跳 /tools/{slug}/app，**不要 target="_blank"**
- link_mode 为 'external' 时，主按钮是「访问官网」→ /go/{slug}，target="_blank"

【8】服务端校验：src/actions/entries.ts 里保存 internal 类型条目时
读 TOOL_REGISTRY，component 不在里面就返回错误
「组件 "xxx" 未在 src/tools/registry.ts 注册，请先创建工具目录并注册」。
这个校验必须有，否则数据库里会存进跑不起来的工具。

【9】/admin/entries 列表里，internal 类型的条目操作列多一个「打开工具」快捷链接。

完成后验证并告诉我：
- 访问 /tools/qr-generator 能看到详情页，点主按钮进入 /tools/qr-generator/app 能用
- 随便找个外链条目，点卡片是否走了 /go/{slug} 并正确跳转
- 在 /admin/clicks 能看到刚才那次点击
- 试着在后台把组件名改成不存在的值，是否被拦下
```

**验收**：外链走 `/go/`；工具运行页无导航无页脚；未注册的组件名保存被拦。

---

## D6 · 好店、门店与二维码

```text
这一段处理线下场景：门店地址、地图、导航、二维码。

════ 第一部分：门店 ════

【1】src/lib/geocode.ts
服务端函数 geocodeAddress(address: string)：
- 调高德 Web 服务 API（https://restapi.amap.com/v3/geocode/geo?key={AMAP_KEY}&address={addr}&city={city}）
- 返回 { lng, lat, poiId, formattedAddress, province, city, district }
- 失败或返回空结果时返回 null，不要抛错
- 结果缓存 24 小时（同一个地址不要反复调，高德有 QPS 和日限额）
- AMAP_KEY 加进 .env.example 并写清申请方式（高德开放平台 → 应用管理 → Web 服务）
- **如果 AMAP_KEY 没配，geocodeAddress 直接返回 null，经纬度降级为手工填写**，
  不要让整个功能报错

【2】src/components/admin/BranchEditor.tsx
在 EntryForm 的 place 形态里使用，管理 entry_branches：
- 可增删门店，每条一个卡片
- 字段：门店名（选填）/ 地址（必填）/ 省市区（自动解析后可手改）/ 电话 /
  营业时间 / 价位 / 是否主门店
- 地址失焦时调 Server Action 做地理编码：
  - 成功 → 回填 lat/lng/poiId/省市区，并在下方嵌入高德**静态地图**
    （https://restapi.amap.com/v3/staticmap?location={lng},{lat}&zoom=16&size=600*300&markers=mid,,A:{lng},{lat}&key={KEY}）
    显示一个标记
  - 提供一个「位置不对？手动调整」按钮，点开后用可拖拽标记的地图让人工纠正
    （这里才用高德 JS SDK，只在这一处用）
  - 失败 → 提示「自动定位失败，请手动填写经纬度」，提供两个数字输入框
- 至少 1 条门店，否则保存失败

【3】src/app/(site)/shops/[slug]/page.tsx 线下店详情页
布局（桌面两栏，移动端单栏）：
- 左：封面大图 + 地址块 + 营业时间 + 电话 + 价位 + 标签 chips
- 右：**导航按钮组**（高德 / 百度 / Apple 地图 / 复制地址）+
  嵌入高德静态地图（点击地图在新标签页打开高德网页版）+
  二维码卡片区
- 连锁店（branches 数 > 1）：地址块替换为「门店列表」，
  按城市分组折叠，每个门店一行（门店名 + 地址 + 导航按钮），
  顶部有城市切换 tab，默认显示条目所属的第一个城市
- 单店：直接显示地址，不显示门店列表
- 底部「同类推荐」同 D7 详情页规则

导航 URL 拼接写在 src/lib/map-links.ts：
  高德  https://uri.amap.com/marker?position={lng},{lat}&name={encodeURIComponent(name)}&src=shanhaiji
  百度  https://api.map.baidu.com/marker?location={lat},{lng}&title={name}&content={addr}&output=html&coord_type=gcj02
  Apple https://maps.apple.com/?ll={lat},{lng}&q={encodeURIComponent(name)}
  复制  纯文本「{name} {address}」
注意：高德/腾讯用 GCJ-02 坐标系，百度用 BD-09，Apple/Google 用 WGS-84。
地理编码拿到的通常是 GCJ-02，百度链接里要带 coord_type=gcj02 让它自己转，
不要自己写坐标转换。

【4】src/app/(site)/shops/map/page.tsx 好店地图
- 整屏地图（高德 JS SDK），左侧浮层筛选：城市（多选）/ 场景标签 / 价位
- 地图上打点，点击弹气泡（店名 + 一句话 + 「查看详情」按钮）
- 顶部有「我在这附近」按钮：浏览器定位 → 调 Server Action 按距离排序 →
  地图飞到当前位置 + 列出最近 20 家
- 距离查询用 bounding box 粗筛 + 哈弗辛公式精排（见 docs/DATA-MODEL.md 4.3 的 SQL），
  **不要上 PostGIS**
- 这个页面必须是客户端组件（地图需要 DOM），但数据从 Server 侧传进来

════ 第二部分：二维码 ════

【5】src/components/admin/QrcodeManager.tsx
在 place 和 external 形态的 EntryForm 里都可挂：
- 每个条目可有多张码，卡片式列表，可拖拽排序
- 字段：标签（必填，如「店主微信」）/ 类型（下拉 6 选 1）/ 图片上传 /
  提示文案 / **过期时间**（日期选择器，可空）
- 上传规则（写进 UI 提示）：
  - 微信识别对清晰度敏感，**边长至少 430px，用 PNG 不要转 webp**
  - 上传后用 sharp 只做「超过 1000px 才缩放」，**不要统一压缩**
  - 存到 UPLOAD_DIR/public/qrcodes/{entry-slug}-{n}.png（**不是 public/**，见 D1 第 8 步）
- 选 wechat-group 类型时，过期时间默认填「今天 + 7 天」并显示一行黄字提醒
  「微信群二维码 7 天后失效，到期记得更换」

【6】/admin/qrcodes 二维码看板（★ 每周必看的页面）
- 顶部三张数字卡：有效 / **7 天内到期** / 已过期
- 主表格按 expires_at 升序排列（最快过期的排最前），列：
  预览缩略图 / 条目名 / 标签 / 类型 / 过期时间 / 状态 / 操作
- 行状态色：已过期标红、7 天内标黄、正常无标记
- 操作：更换图片 / 改过期时间 / 停用（is_active 开关）
- 一个「一键停用所有已过期的码」按钮
- 每天有一次自动任务把 expires_at < now() 的记录置为 is_active=false

【7】前台详情页的二维码展示
- 做成侧栏卡片或「展开查看二维码」按钮，**不要一进页面就弹窗**
- 只展示 is_active=true 且（expires_at 为空或 expires_at > now()）的码
- 每张码下方显示 label 和 tip
- 展开时打一次 show_count + 1
- 一张码都没有时不渲染这个区块，不要留空白框

完成后验证并告诉我：
- 后台建一条线下店，填地址能否自动带出经纬度并在地图上显示标记
- 详情页四个导航按钮是否都能正确打开对应地图
- /shops/map 能否正常打点、筛选、定位
- 上传一张二维码，在 /admin/qrcodes 能否看到，把过期时间改成昨天后前台是否隐藏
```

**验收**：地址自动地理编码可用（无 key 时优雅降级为手填）；`/admin/qrcodes` 过期看板排序正确；过期码前台自动隐藏。

---

## D7 · 前台页面

```text
实现前台。视觉基调：干净、留白足、不花哨。

【设计令牌】只用 globals.css 的 CSS 变量，不写死颜色。
卡片圆角 var(--radius)，边框 1px solid color-mix(in srgb, currentColor 8%, transparent)，
hover 时 transition-shadow 150ms，阴影略加深，不做位移缩放。
页面容器最大宽 1200px，移动端左右 padding 16px，桌面 24px。
图标一律 lucide-react，尺寸 16/20/24 三档，禁止 emoji。

【1】src/components/card/EntryCard.tsx（Server Component）
props: entry, showType?, className?
- 左 40x40 圆角图标（next/image 加载 /icons/xxx.png）；没有图标就用首字母色块兜底
  （底色由条目名 hash 到主色的几个明度变体，不要随机）
- 右上：第一行 name + nameEn 小字灰色；第二行 summary，line-clamp-2
- 第三行标签 chips，最多 4 个，多的显示 +N
- 整卡是 <a>，指向站内详情页 /tools/figma，**不是外链**
- 按 link_mode 显示不同的角标：
  internal → 名字后跟一个「自研」小徽章（主色描边）
  place    → 显示城市名 + 一个 MapPin 小图标
  external → 不显示角标
- 右下角显示域名（从 url 解析，去掉 www.）
- featured 时右上角「精选」角标；status 为 'stale'/'dead' 时 opacity-60 并加灰标
配套写 EntryGrid.tsx：响应式 1/2/3 列（sm/lg），gap-4。

【2】首页 src/app/(site)/page.tsx（Server Component，用 queries.ts 取数）
a. Hero：站名「山海集 · Atlas」+ slogan + 搜索框（客户端组件，回车跳 /search?q=）
b. 「编辑精选」横滑条，getFeatured(6)，移动端可滑动
c. 三个入口大卡：在线工具 / 常用站点 / 推荐店铺，各显示条数，链到 /tools /sites /shops
d. 「按场景逛」：scene 维度标签，按计数倒序，字号分三档（≥10 text-base / 5-9 text-sm / <5 text-xs），
   计数为 0 的标签也渲染但 opacity-50 且不可点
e. 「最新收录」：按 created_at 倒序 12 条，EntryGrid

【3】列表页（三页共用模板 src/components/card/EntryListPage.tsx）
/tools /sites /shops 各写一个薄 page.tsx 调用它，各自写 generateMetadata。
模板结构：
- 标题 + 条数（「在线工具 · 共 12 条」）+ 排序下拉（最新 / 名称 / 精选优先）
- 左侧筛选栏 240px（lg 以下收进 Sheet，用「筛选」按钮触发）
  按维度分组，组内标签显示「名称 (N)」，顺序按 tags 表的 sort
- 右侧结果区 EntryGrid；空结果显示「没有符合条件的收录」+「清空筛选」
- 筛选状态双向同步 URL：?scene=work,study&platform=web，刷新和分享链接结果一致
  用 src/hooks/use-tag-filter.ts 封装（读 useSearchParams，写 router.replace scroll:false）
- 已选条件在标题下显示为可单独删除的 chip，右侧「清空全部」
- **筛选在服务端做**：页面是 Server Component，从 searchParams 读条件去查库，
  客户端组件只负责改 URL。不要把所有数据传给前端再过滤。

【4】详情页 src/app/(site)/{tools,sites,shops}/[slug]/page.tsx
共用 src/components/card/EntryDetail.tsx：
- 面包屑 首页 / 在线工具 / Figma
- 大图标 + name + nameEn + 一句话 summary（大字号）
- 完整标签 chips（按 scene→attr→platform→price→quality 顺序），全部可点，链到标签页
- 主按钮「访问官网」：target="_blank" rel="noopener noreferrer nofollow"，旁边显示域名
- note 编辑手记（若有）
- 元信息表：收录时间 / 平台 / 价格 / 状态
- 底部「同类推荐」：同 scene 的 4 条，排除自己
- 用 generateMetadata 输出独立 title/description；**不要**用 generateStaticParams 全量预渲染
  （数据会变，用默认的动态渲染 + unstable_cache 就够快）
- 页面底部加一个「信息有误？告诉我们」链接到 /submit

【5】标签页
/tags/page.tsx：按维度分区列出全部标签，显示「名称 (N)」和 desc 首句
/tags/[dim]/[slug]/page.tsx：
- 顶部：标签名 + 计数 + tags.desc 全文（这是 SEO 正文，正常排版，不要藏起来）
- 混排三类条目，EntryGrid，排序：featured 优先，其次 created_at 倒序
- 「相关标签」区块：同维度计数最高的其它 6 个
- 计数为 0 时页面照常渲染，内容区显示「这个标签下还没有收录」
- 用 notFound() 处理不存在的 dim/slug

【6】src/app/(site)/not-found.tsx
一句「这个页面走丢了」+ 搜索框 + 回首页按钮，语气轻松，别太长。

完成后 pnpm build && pnpm dev，告诉我首页、/tools、/tools/{任一slug}、/tags/scene/work 四个页面的效果，
以及首页 First Load JS 是多少 KB。
```

**验收**：四个页面正常；筛选后刷新 URL 保留条件；点标签能跳进标签页。

---

## D8 · 搜索与 SEO

```text
【1】搜索 src/app/(site)/search/page.tsx
- 服务端从 searchParams 读 q，直接查数据库（SQLite 的 LIKE '%kw%'）。
  **条目量在几千以内时 LIKE 完全够快（几毫秒），不要上 FTS5，更不要用 pg_trgm（那是 Postgres 的）**
  对 name（权重最高）、name_en、summary、url、以及关联标签的 name 做匹配，
  按「名称命中 > 简介命中 > 标签命中」排序
- 结果分三组显示：在线工具 / 常用站点 / 推荐店铺，每组带条数
- 命中的关键词用 <mark> 高亮（服务端把命中的字段包一层标记，不要在前端正则替换）
- 顶部显示「找到 N 条，耗时 Xms」
- 无结果时：「没找到？提交收录」按钮链到 /submit + 推荐 3 个热门标签
- 搜索词同步到 URL ?q=，刷新保留

【2】src/components/search/CommandPalette.tsx（客户端）
- Cmd/Ctrl + K 唤起，Esc 关闭
- 用 shadcn 的 Command + Dialog
- 数据用 /api/search?q= 的轻量接口（只返回 id/name/type/slug，限 20 条），
  或初次加载时把「全部条目的 id+name+type」这个精简列表（约 100KB 以内）传给客户端本地过滤，
  由你判断哪个更合适并说明理由
- 分组：条目（带类型徽章）、标签、页面（首页/工具/站点/店铺/标签/关于）
- 键盘上下选择、回车打开、Cmd+Enter 新标签页打开
- 挂在 (site)/layout.tsx，前台全站可用；后台不挂

【3】SEO src/lib/seo.ts
- buildMetadata({ title, description, path, image? })：统一 Metadata，
  title 模板 `%s · 山海集 Atlas`，输出 canonical、openGraph（type/siteName/locale=zh_CN/images）、
  twitter（summary_large_image）
- JSON-LD 生成器：jsonLdWebSite()（含 SearchAction）、
  jsonLdEntry(entry)（tool→SoftwareApplication，site→WebSite，shop→Store）、
  jsonLdCollectionPage(dim, tag, entries)（CollectionPage + ItemList + BreadcrumbList）
  用 <script type="application/ld+json"> 注入，转义 </ 防 XSS
- 所有 URL 用 NEXT_PUBLIC_SITE_URL 拼接，不带尾斜杠

【4】src/app/sitemap.ts
从数据库查全部未删除条目 + 全部标签 + 静态页。
lastModified 用条目 updated_at（**不要用 new Date()**，否则每次请求都变）。
priority：首页 1.0，列表页 0.9，标签页 0.8，详情页 0.6。
条目数超过 5000 时分片（generateSitemaps）。

【5】src/app/robots.ts + src/app/feed.xml/route.ts
robots：allow 全部，disallow /admin 和 /api，sitemap 指向完整地址
feed：RSS 2.0，标题「山海集 · 最新收录」，最新 30 条，含 title/link/description/pubDate/guid，
XML 正确转义，Content-Type 为 application/rss+xml; charset=utf-8

【6】动态 OG 图
用 next/og 的 ImageResponse 写 opengraph-image.tsx（详情页和标签页各一份）：
1200x630，左上站名小字 + 中间条目名/标签名（大字，超 20 字自动缩字号）+
底部标签名，主色 #2F6B6B 做一条色带。
如果中文字体渲染不出来，去 Google Fonts 下载 Noto Sans SC 的 ttf 放进项目用 fs 读，
不要退化成只渲染英文。

【7】图标管理（后台侧）
src/components/admin/IconUploader.tsx：
- 支持拖拽上传图片，客户端先裁剪成 128x128 正方形再上传
- 抓取 favicon 后走 src/lib/storage.ts 的 putObject({ kind: 'icons', filename: slug, visibility })，存到
  data/uploads/public/icons/{slug}.png（**不是 public/**，因为 public/ 每次部署会被覆盖，见 D1 第 8 步）
- 「抓取 favicon」按钮：服务端请求 https://www.google.com/s2/favicons?domain={domain}&sz=128，
  失败回退 {origin}/favicon.ico

完成后跑 pnpm build，报告：
- 首页 / 列表页 / 详情页 / 标签页各自的 First Load JS
- sitemap 里有多少条 URL
- 用 Rich Results Test 校验 JSON-LD（可以先本地起服务后用 Google 的在线工具，或至少人工检查输出）
```

**验收**：`/sitemap.xml`、`/robots.txt`、`/feed.xml` 都能访问且内容正确；搜索走数据库而非前端全表过滤。

---

## D9 · 私密层（只有站长能看到的内容）

```text
加一个私密层。详细规格见 docs/PRIVACY.md，**先读那个文件再动手**。

⚠️ 这一段最大的风险是【静默泄漏】：页面照常显示，只是不该看到的人也看到了，而且不会报错。
   所以下面三条铁律必须严格遵守，不要图省事绕过去。

【1】schema 改动（走正常流程：改 schema.ts → db:generate → db:migrate）

⚠️ 这是 SQLite 项目。**不要凭记忆写 Drizzle 代码**，
   `entries` 和 `entry_private` 的完整定义照抄 docs/DATA-MODEL.md 第 2.1 和 2.6 节。

改动清单：

a. entries 加一列 visibility（`text('visibility').notNull().default('public')`）
   取值 public | unlisted | private，行为矩阵见 PRIVACY.md 第一节
   加索引 `index('entries_visibility_idx').on(t.visibility)`

b. 新增 entry_private（1:1）：rating / status / note / contact / paid / visitedOn / updatedAt
   完整代码在 DATA-MODEL.md 第 2.6 节

c. tags.dim 增加 'private' 维度，seed 里加上 5 个：
   todo 想去 / visited 去过 / fav 私藏 / avoid 不推荐 / friend 朋友开的

d. settings 表预置：submissionsOpen(true) / maintenanceMode(false) / defaultVisibility('public')

改完 grep 一遍 `pgTable|jsonb|timestamptz|varchar(` 确认 0 命中。

【2】★ 铁律 1：公开路由永远不查非公开数据

不要在公开页面的 Server Component 里 await auth() 然后决定多渲染几条。
必须拆成两个 URL 空间：

  公开：/tools/figma          路由组 (site)   数据源 getPublicEntries()
  私密：/me/tools/figma       路由组 (admin)  数据源 getAdminEntries()

公开页面**永远只查 visibility='public'**，站长登录与否渲染结果完全一致。
站长想看全部，去 /me。这是为了避开 unstable_cache 的缓存污染——
缓存 key 里不含登录态，站长访问一次就会把私密内容缓存给下一个匿名访客。

【3】★ 铁律 2：查询层拆成两套 API

src/db/queries.ts 里不允许存在「不带可见性过滤的通用查询函数」。

公开组（硬编码 visibility='public'，不接受外部传参，加 unstable_cache + cacheTag('entries')）：
  getPublicEntries(opts) / getPublicEntryBySlug(type, slug) / getPublicFeatured(limit)
  getPublicEntriesByTag(dim, slug) / getPublicTagTree() / getPublicEntriesForSitemap()
  注意：关联标签时加 ne(tags.dim, 'private')，私密标签绝不能出现在公开筛选栏

后台组（第一行必须 await requireAdmin()，**绝不加缓存**）：
  getAdminEntries(opts) / getAdminEntryBySlug(type, slug) / getAdminEntryById(id)
  getPrivateProfile(entryId) / getMeDashboard()

再写一个 tests/privacy.test.ts：
  往测试库里插一条 visibility='private' 的条目，
  遍历所有 getPublic* 导出函数，断言没有一个能拿到它。
这个测试要挂进 CI。它是唯一能在你以后新增查询函数时自动报警的东西。

【4】★ 铁律 3：私密条目的图片不能放 public/

Next 的 public/ 目录没有任何鉴权，任何人知道文件名就能打开。

- 公开条目的图标/二维码/封面：照旧放 public/{icons,qrcodes,covers}
- 私密条目的所有图片：走 src/lib/storage.ts 的 putObject({ visibility: 'private' })，
  落到 data/uploads/private/{entryId}/，访问 URL 是 /api/file/{entryId}/{filename}
  （storage.ts 和读取路由在 D1 第 8 步已经建好了，这里直接用）
- 确认 src/app/api/file/[...path]/route.ts 的行为符合要求：
    await requireAdmin()  →  不登录直接 401
    校验解析后的绝对路径必须以 data/uploads/private 开头（防目录穿越），否则 400
    返回时带 Cache-Control: private, max-age=0, no-store 和 X-Robots-Tag: noindex, nofollow
  这个 no-store 是命脉，写成 public 的话 CDN 会把站长看到的图发给所有人。

- 检查项目里**没有任何地方**再往 public/ 写上传文件（用 grep 搜 'public/' 确认）

【5】/me 站长区域

/admin 是管理台（表格+表单，用来「改」），/me 是站长视角的前台（卡片网格，用来「看」）。
两者都要有。前台组件（EntryCard / EntryGrid / FilterPanel）直接复用，成本很低。

路由：
  /me                      私密首页：我的私藏 / 想去 / 最近添加 / 待办
  /me/tools  /me/sites  /me/shops    各类型全量列表（三种可见性都显示）
  /me/search               全量搜索（含私密）
  /me/notes                私人笔记流（entry_private.note 按更新时间排）
  /me/settings             站点设置（投稿开关 / 维护模式 / 默认可见性）
  /me/entries/[id]         条目详情（复用前台详情组件 + 显示 entry_private 字段）

/me 下所有页面统一：
  - middleware 保护（同 /admin）
  - 每个 Server Component 和 Server Action 里再 requireAdmin() 一次（双保险）
  - 响应头加 X-Robots-Tag: noindex, nofollow 和 Cache-Control: private, no-store
  - 不做任何 ISR / 静态化，每次都是动态渲染

【6】后台要同步改的地方

- EntryForm 增加「可见性」选择器（公开 / 不列出 / 私密），默认取 settings.defaultVisibility
- EntryForm 里增加「私密信息」折叠区（只有可见性无关，任何条目都能填 entry_private）：
  评分 / 状态(想去/去过/已验证/踩雷) / 私人备注 / 联系方式 / 实际花费 / 到访日期
- /admin/entries 列表增加「可见性」列，可筛选；私密行用一个不显眼的标记区分
- TagPicker 在后台显示 private 维度的标签，但公开前台不显示（见铁律 2）
- /admin/settings 增加：投稿开关、维护模式、默认可见性

【7】边界情况（每一条都要处理）

a. 公开改私密时，revalidatePath 必须同时覆盖改之前和改之后的所有路径：
   /、/tools、/tools/{slug}、/tags/{dim}/{tagSlug}、/sitemap.xml
   否则缓存里还留着公开版本，前台还能看到

b. 标签计数要跟着变。2 条「办公」改成私密，公开筛选栏必须从「办公 (12)」变成「办公 (10)」，
   否则点进去只有 10 条，用户会觉得站坏了，而且暗示了有隐藏内容

c. 直接访问 private 条目的公开 URL 一律 notFound() 返回 **404，不要 403**。
   403 等于告诉对方「这个 slug 存在但你看不了」，泄露了信息本身

d. /go/[slug] 跳转：private 条目必须 requireAdmin()，否则等于开了免登录旁路；
   unlisted 正常放行

e. 投稿审核通过后若生成 private 条目，该条不能出现在任何公开面

f. /admin/imports 导出的 JSON 含私密数据，在导出页写一行红字提示
   「此文件含私密内容，不要放公共网盘或提交到 Git」

【8】站长模式提示条

登录后，前台 `(site)` 布局顶部固定一条细窄的横条（主色底 + 白字）：
「站长模式 · 你正在看公开视图 · [进入 /me] [退出]」
不是为了好看，是为了防止你自己搞混——以为在看全部内容，其实是公开视图，
然后纳闷「我那条私藏怎么不见了」。未登录时不渲染这条。

完成后按 docs/PRIVACY.md 第八节的验收清单**逐条真的点一遍**，把结果告诉我。
特别是这三条：
- 匿名直接访问 private 条目的公开 URL 是否返回 404
- 站长登录后看 /tools，内容是否和匿名看到的完全一样（这是缓存安全的证明）
- 公开页面 HTML 源码里搜不到任何私密字段的值
```

**验收**：`docs/PRIVACY.md` 第八节清单全过；`tests/privacy.test.ts` 在 CI 里跑通。

---

## D10 · 部署、备份与运维

```text
⚠️ 这个项目 **不用 Docker、不用 PostgreSQL**。部署方案见 docs/SERVER-DEPLOY.md，
   先读那个文件。目标机器：Ubuntu / 2 核 / 可用内存约 1.2 GB / 约 32 GB 可用磁盘 / 全新空机。

【1】确认上传目录已经是 data/uploads/（D1 第 8 步应该已经做了）
- grep 一遍项目，确认没有任何地方往 public/ 写上传文件
- 确认 src/lib/storage.ts、src/app/media/[...path]/route.ts、src/app/api/file/[...path]/route.ts 三个文件都在
- app/public/ 里只剩构建期资源：favicon、og 兜底图
如果 D1 时没做干净，现在补上——**这一步不做，下次部署上传的图片全丢**。

【3】systemd + Caddy 配置（写进 docs/DEPLOY.md，不要直接改系统文件）
按 docs/SERVER-DEPLOY.md 第九节的内容写：
- /etc/systemd/system/atlas.service：
  WorkingDirectory=/opt/atlas/current（★ 软链，不是 releases/xxx）
  ExecStart=/usr/bin/node server.js
  Environment=PORT=4000 HOSTNAME=127.0.0.1（**只监听回环，4000 不对公网开放**）
  Restart=always
  加固：NoNewPrivileges / PrivateTmp / ProtectSystem=strict /
        ReadWritePaths=/opt/atlas/data（**只留 data/**，releases/ 是只读的）
- /etc/caddy/Caddyfile：handle /media/* 用 root + file_server 直接读
  /opt/atlas/data/uploads/public（带 immutable 缓存头），其余 handle 反代到 127.0.0.1:4000
  说明 Caddy 会自动申请和续期 HTTPS 证书，不需要 certbot

【4】scripts/backup.sh —— SQLite 备份
⚠️ **必须用 `.backup` 命令，不能 cp**。WAL 模式下主库文件单独复制出来是不一致的，
   WAL 里已提交的数据不在主库里。

#!/bin/bash
DB=/opt/atlas/data/atlas.db
DEST=/opt/atlas/data/backups/atlas-$(date +%F).db
sqlite3 "$DB" ".backup '$DEST'"          # 或 VACUUM INTO '$DEST'
gzip -f "$DEST"
find /opt/atlas/data/backups -name '*.db.gz' -mtime +30 -delete
ls -lh "$DEST.gz"

配一个宿主 crontab：每天 3 点跑，并把结果记进 syslog。
再写一个 scripts/restore.sh：从 .db.gz 恢复，执行前要求输入 yes 确认，
恢复后自动重启 atlas 服务。
**写完必须实测一次恢复流程**——没验证过能恢复的备份等于没有备份。

【5】docs/DEPLOY.md
写清完整流程，面向「一年后回来看的自己」：
- 机器现状：2 核 / 2 GB 内存（可用约 1.2 GB）/ 约 32 GB 可用磁盘 / Ubuntu
  **swap 2 GB，挂 fstab，两次重启自动挂载，压测 1800 MB 分配下 swap 峰值 815 MB 无 OOM**
  （这条要写进去，它是"服务器上构建不会挂"的依据）
- **明确写明：不装 Docker、不装 PostgreSQL。** 数据库是 SQLite（一个文件）
- 服务器要装的软件（一次性）：Node 22、Caddy、sqlite3 CLI、build-essential+python3
  （最后一个只为了 better-sqlite3 在需要编译时用得上）
- 目录结构：releases/ + current 软链 + data/。说明 **releases/ 会被新版本替换、
  data/ 永不覆盖、current 只是个软链**
- **★ 明确写死：永远不要在 current/ 里构建或 rsync。** 原因：会读到写了一半的文件，
  而且没法秒级回滚。所有操作都在 releases/{新时间戳} 里做完再换软链
- 首次部署：建用户、建目录、写 .env、装依赖
- **每次发布的完整命令（方案 A，默认）**：本地 pnpm build → 组装 dist-deploy →
  rsync 到 releases/{时间戳} → 服务器补 better-sqlite3 → 换软链 → 重启 → 清理旧版本。
  写清 rsync 要加 --delete（只作用于那个新目录）和 --exclude "node_modules/better-sqlite3"
  （见【6】），以及为什么这样做不会碰到 data/
- 回滚：`ln -sfn /opt/atlas/releases/{上一个版本} /opt/atlas/current && systemctl restart atlas`，
  2 秒完成，不用重新构建。releases/ 保留最近 3 个
- 服务器上构建的备选命令（方案 B）：git clone 到新 release 目录 → pnpm install → pnpm build
  → 换软链 → 重启。写清这在服务器上跑，**不要**在 current/ 里跑
- **备份与恢复**：具体的 .backup 命令和恢复命令
- 常见故障：服务起不来怎么查日志、证书申请失败怎么办、SQLITE_BUSY 怎么处理
- ⚠️ 单独一节写清构建放在哪：**默认本地构建 → rsync 到新 release 目录 → 换软链**。
  服务器构建是正当备选（swap 2 GB 已实测扛住 1800 MB 分配，不会 OOM），
  但要写清代价：耗时 5-15 分钟，且构建期间站点会被换出到 swap 变慢。
  两种方式都写成可直接执行的命令，不要只写一种然后说另一种禁止。
- 一年后要检查什么：磁盘占用、备份是否还在生成、releases/ 有没有堆积、Node 版本

【6】⚠️ better-sqlite3 是原生模块，这是唯一的坑
better-sqlite3 带一个编译好的 .node 二进制。你在 Windows 上 pnpm install 装的是 Windows 版，
直接 rsync 到 Linux 会报 invalid ELF header 或 "Module did not compile against this Node version"。

解决方式（按优先级）：
- 方式 1：部署后在**新 release 目录**里单独装一次：
    cd /opt/atlas/releases/{时间戳} && npm install better-sqlite3 --omit=dev --no-save
  它有 linux-x64 预编译包，通常直接下载。下载失败就 apt install build-essential python3
  后加 --build-from-source 重装。
- 方式 2：干脆改用方案 B（在服务器上构建），依赖本来就在服务器上装，**这个问题直接消失**。
  如果方式 1 折腾超过半小时，不要硬耗，切方案 B。
- rsync 时加 --exclude "node_modules/better-sqlite3"，避免被 Windows 版覆盖
- next.config.ts 里必须有 serverExternalPackages: ['better-sqlite3']
把这三步写进 docs/DEPLOY.md 和部署脚本的注释里。

【7】docs/MAINTENANCE.md —— 日常维护手册
按频率组织，做成可勾选清单：
- 每周：清投稿队列（后台红点）、跑一次 check-links、**看一眼 /admin/qrcodes 有没有快过期的码**、
  看一遍首页有没有排版问题
- 每月：加 10-20 条收录、检查有没有该合并的标签、看一遍后台的「疑似失效」、
  确认 data/backups/ 里有新的备份文件
- 每季：导出一次全站 JSON 存到本地、**实测一次从备份恢复**、检查 sitemap 有没有被搜索引擎收录
- 每年：升级 Next.js 和 Node（先开分支）、检查域名和证书、清理无用标签、看一次磁盘占用
每一步都写清「在后台的哪个页面点哪里」。

【8】docs/CONTENT-GUIDE.md
- 硬性门槛：真实可访问、核心功能可用、无恶意弹窗与强制下载
- 加分项：长期维护、有中文界面、免登录可用、无广告
- 明确不收：需安装来路不明客户端、频繁换域名、纯导流站、停止维护超过 2 年
- 标签使用：一条数据的标签总数 3-8 个，scene 最多 3 个，怎么判断该打哪个 scene
- featured / editor-pick 判定标准，全站占比不超过 15% 的红线
- summary 写「这是什么 + 适合谁」，note 写「我为什么收录它」

【9】docs/SEO-CHECKLIST.md
上线后待办：提交 sitemap 到 Google Search Console / Bing、站点验证、
检查 robots.txt 和 sitemap.xml、Rich Results Test 验证 JSON-LD、
每个标签页 title/description 非空、移动端可用性、首页 LCP 在 4G 下 < 2.5s。

【10】上线前自检
- free -m 看实际占用（应该在 300 MB 以内），swap 用量应该接近 0
- systemctl is-active atlas → active
- ls -l /opt/atlas/current 是软链且指向存在的 release 目录
- 从服务器本机 curl -I http://127.0.0.1:4000 通，从外网访问 4000 **不通**
- 阿里云安全组只开放 22/80/443
- 重启服务器后 atlas 和 caddy 自动起来（systemctl is-enabled 两个都是 enabled）

完成后把 docs/ 下新增的文件列出来，并告诉我 free -m 的实际数字。
```

**验收**：`systemctl is-active atlas` 为 active；`/opt/atlas/current` 是软链；外网访问 4000 不通；`free -m` 实际占用 < 300 MB 且 swap 用量接近 0；手动跑一次备份并用它恢复出一个测试库，数据完整；换一次软链回滚到上一版本再换回来，两次都能正常访问。

---

## D11 · 日常维护短提示（随用随取）

一行版，复制改参数就能用。日常微调不用写长提示。

### 内容和数据

```text
用 pnpm db:studio 之前先别动，帮我在 /admin/entries 加一个「最近 7 天新增」的快捷筛选按钮。
```

```text
写一个 tsx 脚本 scripts/bulk-import.ts，从 CSV 批量导入条目（列：name,url,type,summary,scene,attr），
先预检输出「新增 N / 冲突 M」的明细表，加 --apply 才真正写库。不要动后台的导入页。
```

```text
给 entries 表加一个 source 字段（记录这条是从哪来的：manual/submission/import），
走完整的 schema → generate → migrate 流程，后台表单里做成只读展示。
```

### 后台体验

```text
/admin/entries 的表格列太多了，把「类型」和「更新时间」做成可以勾选显示/隐藏的列，
选择状态存 localStorage。
```

```text
给 /admin/entries 加键盘快捷键：j/k 上下移动选中行，e 进入编辑，空格切换精选。只在没有输入框聚焦时生效。
```

```text
仪表盘加一张折线图，显示最近 90 天每天新增的条目数。不要装图表库，用 div + Tailwind 手写柱状/折线。
```

### 前台

```text
把卡片圆角从 12px 改成 8px，hover 阴影再轻一点，其它一律不动。
```

```text
首页「按场景逛」的 chip 太密，改成 flex-wrap + gap-3，字号三档改成 text-base / text-[13px] / text-xs。
```

```text
详情页加「我常用的」收藏按钮，存 localStorage（key: 'shanhaiji:favorites'），
前台加 /favorites 页面，纯客户端，不要动数据库。
```

### 修 bug

```text
后台改了条目后前台没更新，检查 src/lib/revalidate.ts 是不是漏了路径，修掉并说明原因。
```

```text
/tags/scene/work 在移动端筛选栏被 header 遮住了，修掉，别改其它地方。
```

```text
搜索「免费」时排序不对，标签命中的条目应该排在简介命中的后面，调一下 searchEntries 的排序权重。
```

### 重构（谨慎，一次一个）

```text
EntryForm.tsx 现在太长，拆成 BasicFields / TagFields / MetaFields 三个子组件放同目录，
对外导出不变，不改任何行为。
```

---

## 使用节奏

| 阶段 | 建议 |
|---|---|
| D0–D1 | 一次一段，每段必须 `pnpm build` 通过 + 数据库迁移成功再往下 |
| D2 | 一段做完，登录能进后台再继续 |
| **D3** | **最重要的一段。**如果 AI 一次做不完，按【1】-【7】拆分，编号原样带上 |
| D4 | 可以连发 |
| **D5** | 外链跳转 + 工具系统。分两部分发，先把 `/go/` 跑通再做工具 |
| **D6** | 好店与二维码。分两部分发，先做门店（要调高德 API）再做二维码 |
| D7 | 按【1】-【6】拆分 |
| D8 | 一次发完 |
| **D9** | **私密层。风险最高的一段，做完必须逐条走 PRIVACY.md 的验收清单** |
| D10 | 一次发完，都是配置和文档 |
| D11 | 之后每次只发一条 |

**五条铁律**

1. **报错原文贴回去，不要自己描述。** 「有个报错」AI 修不好，「Error: relation "entries" does not exist at src/db/queries.ts:42」它一次就修好。
2. **一次只做一件事。** 不要同一条消息里既加功能又改样式又加数据。
3. **它说做完了不等于做完了。** 一定自己跑 `pnpm build`，再打开后台点一遍流程。
4. **警惕 AI 走回头路。** 如果它提议「把数据导出成 JSON 存仓库」「用 output: 'export' 部署到 Pages」——这是在把你的动态站改回静态站，直接否掉。
5. **警惕 AI 在私密层走捷径。** 它极可能写出「在公开页面里 `await auth()` 判断是不是站长，是就多渲染几条」——
   这看着能用，实际会把私密内容缓存给匿名访客。正确做法永远是**两个 URL 空间 + 两套查询函数**（见 D9 铁律 1）。
