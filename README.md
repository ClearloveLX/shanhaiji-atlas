# 山海集 · Atlas

> 万物皆可收录，一签就能找到。

一个**可持续维护**的生活导航站：在线工具 + 常用站点 + 推荐店铺，按多维度标签组织。
日常维护全部在 `/admin` 后台完成 —— 加条目、改标签、审投稿、查死链，点几下就行，
**不需要改代码，也不需要重新构建**。

---

## 一、一眼看懂

| 项目 | 值 |
|---|---|
| 中文名 / 英文名 | 山海集 / Atlas |
| Slogan | 万物皆可收录，一签就能找到 |
| 仓库 | `github.com/ClearloveLX/shanhaiji-atlas` |
| 技术栈 | Next.js 15 全栈（App Router）+ React 19 + TypeScript + Tailwind v4 |
| 数据库 | **SQLite**（一个文件，无进程、无端口、无账号） |
| ORM / 认证 | Drizzle ORM + Auth.js v5（单管理员 Credentials 登录） |
| 应用端口 | **4000**，只监听 `127.0.0.1`，不对公网开放 |
| 反向代理 | **Caddy 2.6.2**（自动 HTTPS，不用 certbot） |
| 部署方式 | **本地构建 → 只传产物**（tar + SFTP → release 目录 + 软链），不用 Docker |
| 运行环境 | Node **22** LTS |
| 默认语言 | zh-CN |

> 这是一份**可自建**的部署方案：拿一台 2 核 / 2 GB 的入门级云服务器就能跑。
> 本文档所有涉及具体机器的值（IP、SSH 端口、路径）都是占位符，按你自己的替换。

---

## 二、为什么是动态站，不是静态站

| | 静态导出（JSON + rebuild） | **本项目（数据库 + 后台）** |
|---|---|---|
| 加一条收录 | 改 JSON → commit → 重新构建 → 部署 | 打开 `/admin/entries/new` 填表 → 保存 → 前台立刻可见 |
| 改标签名 | 全库搜替换，容易漏 | `/admin/tags` 点编辑 |
| 处理投稿 | 收邮件 → 手工加 | `/admin/submissions` 一键通过 |
| 查死链 | 跑脚本 → 手工改 JSON | 定时巡检自动写回，后台红点提示 |
| 换服务器 | 复制仓库重新构建 | `sqlite3 .backup` 一个文件 + 换个 IP |
| 批量改 50 条 | 手改 JSON，易错 | 后台勾选 → 批量打标签 |

**维护体验就是这个项目的核心功能。**

---

## 三、目录结构

```
shanhaiji-atlas/
│
├── data/                              # ★ 运行时数据，不进 Git，永不随部署覆盖
│   ├── atlas.db                       #   SQLite 主库（+ -wal / -shm 两个兄弟文件）
│   ├── uploads/
│   │   ├── public/{icons,qrcodes,covers}/    # 公开图片，由 Caddy 直接 file_server
│   │   └── private/{entryId}/                # ★ 私密条目图片，走鉴权路由
│   └── backups/                       #   atlas-YYYY-MM-DD.db.gz
│
├── drizzle/                           # 迁移 SQL，要提交进 Git
│   ├── 0000_condemned_leech.sql       #   文件名是 drizzle-kit 随机生成的，不是手写的
│   ├── 0001_friendly_leopardon.sql
│   ├── …  0002 / 0003 / 0004 / 0005
│   └── meta/_journal.json             #   迁移顺序表，scripts/migrate.mjs 也读它
│
├── docs/                              # 设计文档（这份 README 讲"是什么"，docs/ 讲"为什么"）
│   ├── DATA-MODEL.md                  # ★ 数据模型设计（三种形态、为什么这么拆）
│   ├── PRIVACY.md                     # ★ 私密层设计（三档可见性、三条防泄漏铁律）
│   ├── SERVER-DEPLOY.md               # ★ 选型论证（为什么 SQLite / 不用 Docker / 在哪构建）
│   ├── DEPLOY.md                      # ★ 实际部署手册（照抄可执行，含故障排查）
│   ├── NAMING.md                      # 命名规范
│   ├── TAGS.md                        # 标签体系定义
│   ├── CONTENT-GUIDE.md               # 收录标准与文案规范
│   ├── SEO-CHECKLIST.md               # 上线后 SEO 检查清单
│   ├── MAINTENANCE.md                 # 日常维护手册（每周/每月做什么）
│   └── PROMPTS.md                     # 历史提示词归档（★ 顶部有"已作废"清单，别照抄）
│
├── public/                            # 构建期静态资源。**当前是空的，这是正常的**
│                                      #   favicon → src/app/favicon.ico（Next 约定）
│                                      #   分享图 → src/app/og/route.tsx（动态生成）
│                                      #   ★ 用户上传的图片在 data/uploads/，不在这里
│
├── scripts/                           # 运维脚本（★ 必须随 release 一起传，见第七节）
│   ├── backup.sh                      #   sqlite3 .backup + 保留最近 30 份（不能用 cp）
│   ├── restore.sh                     #   从备份恢复，带二次确认
│   ├── migrate.mjs                    #   ★ 纯 Node 迁移器，服务器上没有 pnpm/tsx，靠它
│   ├── link-check.ts                  #   死链巡检（cron 调用）
│   └── fetch-icons.ts                 #   批量抓 favicon
│
├── tests/
│   ├── privacy.test.ts                # ★ 私密层防泄漏：断言所有 getPublic* 拿不到私密条目
│   └── svg-sanitize.test.ts           # ★ SVG 清洗回归：38 条断言，含 8 种 @import 绕过写法
│
├── src/
│   ├── app/
│   │   ├── (site)/                    # ── 前台路由组
│   │   │   ├── layout.tsx             #   前台布局：header / footer / 主题
│   │   │   ├── page.tsx               #   首页
│   │   │   ├── tools/{page,[slug]/page}.tsx          # 工具列表 / 详情
│   │   │   ├── sites/{page,[slug]/page}.tsx          # 站点列表 / 详情
│   │   │   ├── shops/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [slug]/page.tsx                   # 线下店：地址+地图+导航+二维码
│   │   │   │   └── map/page.tsx                      # ★ 好店地图，支持「我在这附近」
│   │   │   ├── tags/{page,[dim]/[slug]/page}.tsx     # 标签总览 / 标签聚合页（SEO 主力）
│   │   │   ├── search/page.tsx
│   │   │   ├── submit/page.tsx                       # 投稿表单 → 写 submissions 表
│   │   │   └── not-found.tsx
│   │   │                             #   注：全站没有 /about，也没做 /q/{code} 短链（阶段二）
│   │   │
│   │   ├── (tool)/                    # ── ★ 自研工具运行页独立成组：全屏、无导航无页脚
│   │   │   ├── layout.tsx
│   │   │   └── tools/[slug]/app/page.tsx
│   │   │
│   │   ├── (admin)/                   # ── 后台与站长区，middleware 保护
│   │   │   ├── admin/                 #   后台：仪表盘 / 条目 / 门店 / 二维码 / 点击 /
│   │   │   │                          #         标签 / 投稿 / 回收站 / 导入导出 / 设置 / 分析
│   │   │   │                          #   （每个功能一个 page.tsx，列表见下）
│   │   │   └── me/                    # ★ 站长区：用前台卡片看全部内容（含私密）
│   │   │       ├── page.tsx           #   我的私藏 / 想去 / 最近添加 / 待办
│   │   │       ├── {tools,sites,shops}/page.tsx       # 各类型全量列表（三种可见性都显示）
│   │   │       ├── search/page.tsx    #   全量搜索（含私密）
│   │   │       ├── notes/page.tsx     #   私人笔记流
│   │   │       ├── entries/[id]/page.tsx
│   │   │       └── settings/page.tsx
│   │   │                             #   注：/me 下没有标签管理页，标签统一在 /admin/tags
│   │   │
│   │   ├── go/                        # ★ 外链跳转中间页（记点击 + 302）
│   │   │   ├── [slug]/route.ts
│   │   │   ├── gone/page.tsx          #   外链已失效的兜底页
│   │   │   └── not-found/page.tsx
│   │   ├── media/[...path]/route.ts   # 公开图片兜底路由（**仅本地开发生效**，生产被 Caddy 接管）
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── file/[...path]/route.ts        # ★ 私密文件鉴权路由（requireAdmin + no-store）
│   │   │   ├── cron/link-check/route.ts       # 定时巡检入口（带 token 校验）
│   │   │   ├── cron/qrcodes/route.ts          # 过期二维码下架（★ 需要自己配 crontab）
│   │   │   └── search/route.ts                # 命令面板用的只读搜索
│   │   ├── feed.xml/route.ts          # RSS
│   │   ├── og/route.tsx               # ★ 动态分享图（用 satori 现画，不是静态文件）
│   │   ├── login/page.tsx
│   │   ├── sitemap.ts / robots.ts     # 从数据库生成
│   │   ├── layout.tsx / not-found.tsx
│   │   └── favicon.ico
│   │
│   ├── actions/                       # ── Server Actions，写操作全在这里
│   │   ├── entries.ts                 # 增删改、批量操作、切换精选/失效
│   │   ├── tags.ts                    # 标签增删改、合并、排序
│   │   ├── submissions.ts             # 审核通过/拒绝（通过时自动建档）
│   │   ├── uploads.ts                 # 图片上传（含 SVG 清洗）
│   │   ├── qrcodes.ts                 # 二维码增删改、批量停用过期
│   │   ├── imports.ts                 # 导入导出
│   │   ├── settings.ts / geocode.ts / map.ts / favicon.ts / tools.ts / auth.ts
│   │
│   ├── components/
│   │   ├── ui/                        # shadcn 原子组件（16 个）
│   │   ├── admin/                     # 后台专用（22 个）
│   │   ├── card/                      # 条目卡片、详情、门店列表、地图、二维码卡
│   │   ├── filter/                    # 筛选面板、标签 chip、已选条件
│   │   ├── search/                    # 搜索框、命令面板、高亮、排序
│   │   ├── layout/                    # 站头站尾、主题、JSON-LD、Logo
│   │   ├── submit/                    # 投稿表单
│   │   └── tools/                     # 工具页公共件
│   │
│   ├── tools/                         # ★ 自研在线工具（加一个工具 = 一个目录 + registry 一行）
│   │   ├── registry.ts                #   slug → 懒加载函数，唯一注册处
│   │   ├── qr-generator/{index.tsx,meta.ts,lib/qr.ts}
│   │   ├── text-diff/{index.tsx,meta.ts,lib/diff.ts}
│   │   ├── eat-today/{index.tsx,meta.ts,lib/foods.ts}
│   │   └── farm-planner/{index.tsx,meta.ts,lib/plan.ts}
│   │
│   ├── db/
│   │   ├── schema.ts                  # ★ Drizzle 表定义，单一事实来源（13 张表）
│   │   ├── index.ts                   # better-sqlite3 连接 + 五个 PRAGMA
│   │   ├── queries.ts                 # 所有读查询（公开的走 unstable_cache，站长的直通）
│   │   ├── seed.ts / migrate.ts / reset.ts / load-env.ts
│   │
│   ├── hooks/                         # use-tag-filter / use-debounce / use-unsaved-warning
│   ├── lib/
│   │   ├── svg.ts                     # ★ SVG 清洗（三层防护的第二层）
│   │   ├── request-origin.ts          # ★ 反代后面拼绝对 URL 用（不能用 request.url）
│   │   ├── storage.ts                 # 图片落盘唯一入口（目录 ⇄ URL 的对应关系只在这里）
│   │   ├── auth.ts                    # Auth.js 配置 + requireAdmin()
│   │   ├── validation.ts              # Zod schema（前后端共用）
│   │   ├── revalidate.ts              # ★ 写库后要刷新哪些路径的映射表
│   │   ├── seo.ts / site-config.ts / tags.ts / upload-gc.ts / link-check.ts
│   │   ├── clicks.ts / analytics.ts / qrcodes.ts / entries.ts / detail-page.ts
│   │   ├── list-page.ts / list-params.ts / geocode.ts / map-links.ts / utils.ts
│   │
│   ├── styles/globals.css             # ★ 主题在这里（Tailwind v4 走 CSS 配置，没有 tailwind.config.ts）
│   ├── types/index.ts
│   └── middleware.ts                  # 保护 /admin 与 /me
│
├── AGENTS.md                          # ★ 喂给 AI 的常驻规则
├── LICENSE                            # MIT
├── README.md
├── .env.example                       # 环境变量模板（.env.local 不进 Git）
├── .gitignore
├── components.json                    # shadcn 配置
├── drizzle.config.ts
├── eslint.config.mjs
├── next.config.ts                     # output: 'standalone'
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml                # ★ nodeLinker / allowBuilds / supportedArchitectures 都在这
├── postcss.config.mjs                 # Tailwind v4 插件挂在这里
└── tsconfig.json
```

### 命名速查

| 对象 | 规则 | 示例 |
|---|---|---|
| 路由目录 | 全小写 kebab-case，动态段 `[方括号]` | `src/app/(site)/tags/[dim]/[slug]/` |
| 路由组 | `(圆括号)`，不出现在 URL | `(site)` `(admin)` `(tool)` |
| 组件文件 | `PascalCase.tsx`，一个文件一个默认导出 | `EntryForm.tsx` |
| 工具 / hook | kebab-case 文件 + camelCase 导出 | `use-tag-filter.ts` → `useTagFilter()` |
| Server Action | 动词开头，返回 `{ ok, error?, data? }` | `createEntry` `mergeTags` |
| 表名 | 复数 snake_case | `entries` `entry_tags` `link_checks` |
| 列名 | snake_case | `created_at` |
| 条目 slug | 全小写 kebab-case，**与 URL 一致** | `figma` → `/tools/figma` |
| 标签 slug | 全小写英文 kebab-case，永不用中文 | `no-login` `editor-pick` |
| URL | 全小写，多值 query 用逗号 | `/tools?scene=work,study` |

---

## 四、数据表（13 张）

一条 `entry` = 一个「可以被推荐的东西」。形态差异由 `link_mode` 区分，专属数据进子表。
完整设计见 [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)。

| 表 | 作用 | 关系 |
|---|---|---|
| `entries` | 三类条目统一存一张表：`type` 决定分类、`link_mode` 决定形态、`visibility` 决定可见性 | — |
| `entry_tools` | **自研工具**专属：组件名、运行时、用量、版本 | 1:1 |
| `entry_branches` | **线下门店**：地址、经纬度、电话、营业时间 | 1:N |
| `entry_qrcodes` | **二维码**：标签、图片、**过期时间**、展示统计 | 1:N |
| `entry_private` | **只有站长看得到的字段**：我的评分、私人备注、联系方式、实际花费 | 1:1 |
| `tags` | 标签字典，`(dim, slug)` 唯一（含 `private` 私密维度） | — |
| `entry_tags` | 条目 ↔ 标签多对多 | — |
| `submissions` | 访客投稿，审核通过后一键转成 entry | — |
| `link_checks` | 死链巡检历史 | 1:N |
| `click_logs` | 外链点击统计，**按天聚合** | — |
| `visit_daily` | 访客去重（按天 + visitor hash） | — |
| `page_view_daily` | 页面浏览（按天 + 路径聚合） | — |
| `settings` | 站点信息、投稿开关、维护模式、**管理员账号** | 键值表 |

> 数据库里实际是 14 张表 —— 多出来的 `__drizzle_migrations` 是 Drizzle 自己维护的迁移记录，不是业务表。

### 三档可见性

| `visibility` | 进列表/搜索/标签页 | 直接访问 URL | sitemap / RSS |
|---|:---:|:---:|:---:|
| `public` 公开 | ✅ | ✅ | ✅ |
| `unlisted` 不列出 | ❌ | ✅ | ❌ |
| `private` 私密 | ❌ | **404**（站长走 `/me/...`） | ❌ |

**一个 URL 只有一种内容**：公开路由永远只查 `public`，站长登录与否渲染结果完全一致；
想看全部内容去 `/me`。这是为了避开缓存污染 —— 完整理由和三条防泄漏铁律见
[`docs/PRIVACY.md`](docs/PRIVACY.md)。

### 三种形态

| link_mode | 是什么 | 主按钮 | 例子 |
|---|---|---|---|
| `external` | 别人的网站 / 工具 / 网店 | 访问官网（走 `/go/{slug}`） | Figma、B 站 |
| `internal` | **你自研的在线工具** | 打开工具（站内 `/tools/x/app`） | 二维码生成器 |
| `place` | **线下好店**，有实体地址 | 导航过去（高德 / 百度 / Apple） | 某家咖啡店 |

**加一个自研工具只需要三步**：`src/tools/` 建目录（`index.tsx` + `meta.ts`）→ `registry.ts` 加一行
→ 后台建条目。不改数据库、不写迁移、不动路由。

---

## 五、快速开始（本地开发）

```powershell
cd shanhaiji-atlas          # 你的克隆目录

pnpm install          # 需要 Node 22+ / pnpm 11+
pnpm db:migrate       # 建表
pnpm db:seed          # 灌标签字典 + 示例数据 + 建管理员账号
pnpm dev              # http://localhost:4000
                      # 后台 http://localhost:4000/admin
                      # 站长区 http://localhost:4000/me
```

先复制 `.env.example` 成 `.env.local` 并填好 `AUTH_SECRET`（`openssl rand -base64 32`）
和 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（只在 seed 时用一次，密码会 bcrypt 后写进 `settings` 表）。

数据库会自动生成在 `data/atlas.db`。**SQLite 是文件，不用先起数据库服务。**

---

## 六、npm scripts

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器，端口 4000 |
| `pnpm build` | 生产构建（standalone）。**默认只在本地跑，不在服务器上跑** |
| `pnpm start` | 本地跑生产构建 |
| `pnpm lint` / `pnpm typecheck` | 静态检查 |
| `pnpm db:generate` | 按 schema 生成迁移 SQL |
| `pnpm db:migrate` | 执行迁移（本地，走 tsx） |
| `pnpm db:seed` | 灌入标签字典 + 示例数据 + 建管理员账号 |
| `pnpm db:studio` | Drizzle Studio 图形化改数据（端口 4001） |
| `pnpm db:reset` | 清库重建（仅开发用，带二次确认） |
| `pnpm backup` | SQLite `.backup` 全量备份（**不能用 cp**） |
| `pnpm check-links` | 死链巡检 |
| `pnpm icons:fetch` | 批量抓取 favicon |
| `pnpm test:privacy` | 私密层防泄漏测试：断言所有 `getPublic*` 都拿不到私密条目 |
| `pnpm test:svg` | SVG 清洗回归测试：38 条断言，覆盖 8 种 `@import` 绕过写法 |

---

## 七、部署

**一句话：本地构建，只传产物，release 目录 + 软链切换。**

```powershell
# deploy.py 是配套的发布脚本，放在哪都行（本项目没把它放进仓库，
# 因为它含服务器 IP / SSH 端口 / 密钥路径 —— 那不该出现在开源仓库里）
python deploy.py                    # 构建 + 打包 + 上传 + 切换 + 烟测，一条命令
python deploy.py --list             # 看服务器上有哪些版本、服务状态
python deploy.py --rollback 版本号      # 2 秒回滚，版本号从 --list 里看
python deploy.py --logs             # 看应用日志
```

> **本文档的占位符约定**：文中 `你的XXX`（如 `你的服务器IP`、`你的SSH端口`、`你的项目目录`）
> 是需要你替换成自己实际值的占位符。用尖括号的地方只有代码语法本身（如 `src/tools/<slug>/`）。

服务器上只跑 `node server.js`。**不装 Docker、不装 PostgreSQL、不装 pnpm、不跑构建。**

### 服务器布局

```
/opt/atlas/
├── current -> releases/20261016-1619/    # 软链，systemd 的 WorkingDirectory
├── releases/                             # 每个版本一个目录，保留最近 3 个
├── data/                                 # ★ 永不动
│   ├── atlas.db                          #   SQLite 主库
│   ├── cache/                            #   ★ Next 的 .next/cache 软链到这里
│   ├── uploads/{public/{icons,qrcodes,covers},private}/
│   └── backups/
├── scripts/                              # release 外面的稳定路径，cron 引用它
└── .env                                  # 权限 600，属主 atlas
```

### 为什么这么设计

| 决策 | 理由 |
|---|---|
| **SQLite 而不是 PostgreSQL** | 单机、单管理员、写入不频繁、数据几 MB —— 省一个进程、一个端口、一套调优、一种备份方式 |
| **不用 Docker** | `dockerd` 是 130 MB 常驻内存的固定税，而这台机器可用内存只有 1200 MB；原生部署 `journalctl -u atlas -f` 一条命令看到底 |
| **本地构建** | `next build` 峰值 1.2-1.8 GB，靠 swap 能扛但会拖慢 5-15 分钟；本地构建 + 传输只要 ~40 秒 |
| **release + 软链** | 部署期间旧版本仍在服务；回滚 = 换一条软链 + 重启，2 秒 |
| **Caddy 而不是 nginx** | 一条 `handle` 就能反代，HTTPS 证书自动申请续期，不用 certbot |

完整论证见 [`docs/SERVER-DEPLOY.md`](docs/SERVER-DEPLOY.md)，可照抄的操作步骤见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

### 三个容易踩的坑（都已处理，改部署脚本时别删）

1. **组装 release 时必须删掉 `data/`。**
   `next build` 会因为 `src/lib/storage.ts` 里的 `path.resolve(process.cwd(), './data/uploads')`
   被 Next 的文件追踪命中，把本地 `data/uploads` 整棵打进 `.next/standalone/`。
   不删就把陈旧上传混进每个 release。

2. **release 里的 `.next/cache` 必须软链到 `/opt/atlas/data/cache`。**
   systemd 是 `ProtectSystem=strict` + `ReadWritePaths=/opt/atlas/data`，release 本身只读。
   不软链 Next 就无处可写，表现是 `next/image` 优化接口 500
   + `unstable_cache` 增量缓存全部失效（`src/db/queries.ts` 所有读查询都走它）。

3. **`scripts/` 和 `drizzle/` 不在 standalone 产物里，必须显式拷。**
   否则 `/opt/atlas/current/scripts/backup.sh` 永远不存在，cron 静默空转，备份等于没有。

---

## 八、安全设计

### SVG 的三层防护（缺一层就不算防住）

SVG 是唯一「能被浏览器当文档打开、里面还能跑脚本」的图片格式，本项目用了三层：

| 层 | 在哪 | 生效范围 |
|---|---|---|
| ① 只有站长能传 | `src/actions/uploads.ts` 的 `requireAdmin()` | 全部环境 |
| ② 上传时清洗 | `src/lib/svg.ts` 的 `sanitizeSvg()` | 全部环境 |
| ③ 响应头 `CSP: default-src 'none'; sandbox` | **两处都要写**：`src/app/media/[...path]/route.ts`（本地）+ `/etc/caddy/Caddyfile` 的 `handle_path /media/*`（生产） | 见下 |

**为什么第 ③ 层要写两遍**：生产环境 `/media/*` 被 Caddy 直接读盘接管，
Next 的那个路由**根本不会执行**。只在路由里写安全头 = 生产环境实际少一层。
`pnpm test:svg` 会把第 ② 层的 38 条断言钉住。

### 其他

- `src/lib/request-origin.ts` —— 反向代理后面拼跳转 URL **必须**用它，
  不能用 `request.url`：Next 的 standalone server 会把请求 origin 当成自己的监听地址
  （`127.0.0.1:4000`），拿它做跳转会把访客送去访问他自己的 localhost
- `middleware.ts` 只做「cookie 在不在」的粗筛（Edge runtime 连不了 SQLite），
  真正的鉴权在每个页面 / Action 的 `requireAdmin()`
- 私密图片走 `/api/file/*`（`requireAdmin` + `no-store`），和公开图片是两个**访问出口**，
  不是两个目录 —— 详见 [`docs/PRIVACY.md`](docs/PRIVACY.md)
- SQLite 五个 PRAGMA 一个都不能少：`journal_mode=WAL`、`busy_timeout=5000`、
  `synchronous=NORMAL`、`foreign_keys=ON`、`cache_size=-16000`

### 部署时的服务器加固（建议照做）

| 项 | 做法 |
|---|---|
| SSH | **别用 22 端口**，改成非标准端口；**只留公钥认证**，关掉密码登录 |
| 防火墙 / 安全组 | 只放行 SSH 端口 + 80 + 443；**4000 不开放**（应用只监听回环） |
| fail2ban | 盯 SSH 端口，连续失败就封禁 |
| 应用沙箱 | systemd `ProtectSystem=strict` + `NoNewPrivileges` + 私有 `/tmp` 等 9 项（见 §七） |
| swap | 内存小的机器必挂 swap —— 不是为了跑得快，是为了**不 OOM** |

---

## 九、已知未实现 / 待办

诚实清单，避免以后照着文档找不存在的功能：

| 项 | 现状 |
|---|---|
| 登录失败限速 | **未实现**。`src/lib/auth.ts` 失败时只有 `await sleep(500)`，没有计数、没有锁定 |
| 后台路径改名 | **未实现**。`middleware.ts` 的 matcher 硬编码 `/admin` 与 `/me`，没有 `ADMIN_PATH` 环境变量 |
| 二维码自动下架 | `/api/cron/qrcodes` 端点**已存在**，但**需要自己配 crontab**才会跑；不配就只能后台点「一键停用所有已过期的码」 |
| `quality/new`、`quality/dead` 标签 | **人工挂**，没有脚本自动标记 / 自动摘除 |
| `/q/{code}` 短链 | **阶段二**，未实现 |
| `/about` 页面 | 不存在 |
| 中文分享图 | 需要可选配置 `OG_FONT_PATH`（satori 不内置中文字形），不配则退化成英文站名 |
| 存储后端切换 | 写死本地卷。`src/lib/storage.ts` 是唯一落盘入口，换 OSS 只改这一个文件 |
| CI | 没有。测试靠本地手动 `pnpm test:privacy` / `pnpm test:svg` |

---

## 十、三条底线

1. **不收录**需要安装来路不明客户端、有强制弹窗、频繁换域名的站点。
2. **每条数据必须有** `type` + 至少一个 `scene` 标签，保存时 Zod 拦截。
3. **前台读数据库，后台写数据库**，中间靠 `revalidatePath` / `revalidateTag` 打通 ——
   这是全项目唯一需要理解的机制。

---

## 许可

[MIT](LICENSE) © 2026 ClearloveLX

可以自由使用、修改、分发、商用，包括闭源再发布。**唯一要求是保留版权声明和许可声明**
（也就是别把 `LICENSE` 文件删掉）。软件按「原样」提供，不附带任何担保。

> 所以你可以直接拿这份代码搭自己的导航站，改品牌、改数据、改设计都行，不用问我。

---

## 关于本仓库的脱敏约定

这是一个**可自建**的项目，文档里刻意不包含任何具体部署实例的信息：

- **不写**服务器 IP、内网地址、实例 ID、SSH 端口、密钥文件名、主机名
- 内存 / 磁盘 / swap 只给量级（`2 核 2 GB` / `40 GB`），不给实测精确值
- 所有这类值写成占位符（`你的服务器IP` / `你的SSH端口` / `你的项目目录`），按自己的替换

**密钥、令牌、管理员账号从来不在仓库里**：`.env*` 全部被 `.gitignore` 拦住
（只放行 `.env.example` 模板，且模板里的值都是空的），`data/`（数据库与上传）同样不进仓库。
配套的发布脚本 `deploy.py` 因为含 IP / 端口 / 密钥路径，也**故意不放进仓库**。
