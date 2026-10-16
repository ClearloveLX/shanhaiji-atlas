# 私密层设计 — 山海集 Atlas

> 需求：站里要有一部分内容**只有站长自己看得到**。
>
> 这一节比看起来难。不是因为功能复杂，而是因为**做错的方式是静默的** ——
> 页面照常显示，只是不该看到的人也看到了，而你不会收到任何报错。
> 所以下面的重点不是「怎么加个字段」，而是**怎么让泄漏在编译期和测试里就暴露出来**。

---

## 一、三档可见性

给 `entries` 加一列（定义见 [`DATA-MODEL.md`](DATA-MODEL.md) 第 2.1 节）：

```ts
visibility: text('visibility').notNull().default('public')
// public   公开：进列表、搜索、标签页、sitemap、RSS
// unlisted 不列出：知道链接就能访问，用于发给朋友的专属推荐 / 还没准备好公开的页面
// private  私密：只有站长登录后可见
```

配套索引：`index('entries_visibility_idx').on(t.visibility)`，
或直接并进 `(type, visibility, status)` 复合索引。

`unlisted` 是顺带加的，成本为零但很有用（「这条我想分享给某个人，但不想让它出现在站内任何列表里」）。
**不想用就永远不选它**，不影响其它部分。

### 行为矩阵（把这个表当成规格，实现时逐行对照）

| 场景 | `public` | `unlisted` | `private` |
|---|:---:|:---:|:---:|
| 列表页 `/tools` `/sites` `/shops` | ✅ | ❌ | ❌ |
| 标签聚合页 `/tags/{dim}/{slug}` | ✅ | ❌ | ❌ |
| 首页「编辑精选」「最新收录」 | ✅ | ❌ | ❌ |
| 站内搜索 `/search` | ✅ | ❌ | ❌ |
| 标签计数（筛选栏的「办公 (12)」） | 计入 | 不计 | 不计 |
| 直接访问 `/tools/{slug}` | ✅ | ✅ | **404** |
| `sitemap.xml` / `feed.xml` | ✅ | ❌ | ❌ |
| 外链跳转 `/go/{slug}` | ✅ | ✅ | 需登录 |
| `/admin` 各处 | ✅ | ✅ | ✅ |
| `/me` 各处 | ✅ | ✅ | ✅ |

注意倒数第三行：**私密条目直接访问要返回 404，不是 403。**
403 等于告诉对方「这个 slug 存在，只是你看不了」，泄露了信息本身。
一律 `notFound()`。

---

## 二、三条防泄漏铁律

这三条是整个设计的核心。违反任意一条，泄漏都是**静默发生**的。

### 铁律 1 · 公开路由永远不查非公开数据

不要写「在 Server Component 里 `await auth()` 判断是不是站长，然后决定要不要多渲染几条」。
原因有三个，每一个都足以致命：

1. **缓存污染**：`unstable_cache` 的 key 里不含登录态。站长访问一次，私密内容就被缓存下来，
   下一个匿名访客直接命中缓存拿到私密数据。
2. **静态化**：`generateStaticParams` 或 PPR 可能在构建时就把数据烤进 HTML。
3. **分享链接泄露**：站长复制了 URL 发给别人，对方打开时因为自己不是站长而看到空白 ——
   看起来是"没坏"，但如果哪天鉴权判断写反了，就是直接泄漏。

**正确做法：私密内容有独立的 URL 空间。**

| | 公开 | 私密 |
|---|---|---|
| URL | `/tools/figma` | `/me/tools/figma` |
| 路由组 | `(site)` | `(admin)` |
| 数据源 | `getPublicEntries()` | `getAdminEntries()` |
| 缓存 | `unstable_cache` + `cacheTag('entries')` | **不加缓存**，或独立 tag `entries:admin` |
| 鉴权 | 无 | `requireAdmin()` |

公开页面**永远只查 `visibility = 'public'` 的数据**，站长登录与否渲染结果完全一样。
站长想看全部内容，去 `/me`。

### 铁律 2 · 查询层用两套 API，把「忘记过滤」变成错误

`src/db/queries.ts` 里**不要存在任何不带可见性过滤的通用查询函数**。分成两组：

```ts
// ── 公开组：硬编码 visibility = 'public'，外部无法绕过 ──
export const getPublicEntries = cache(async (opts) => {
  return db.select().from(entries).where(and(
    eq(entries.visibility, 'public'),       // ★ 写死在这里，不接受外部传参
    isNull(entries.deletedAt),
    eq(entries.status, 'active'),
    ...buildFilters(opts),
  ))
}, ['public-entries'], { tags: ['entries'] })

export const getPublicEntryBySlug = cache(async (type, slug) => { /* 同样写死 public */ }, ...)

// ── 后台组：必须在第一行鉴权，绝不加缓存 ──
export async function getAdminEntries(opts) {
  await requireAdmin()                       // ★ 第一行
  return db.select().from(entries).where(and(
    isNull(entries.deletedAt),
    ...buildFilters(opts),
  ))
}

export async function getAdminEntryBySlug(type, slug) {
  await requireAdmin()                       // ★ 第一行
  // 这里不过滤 visibility，三种都返回
}
```

规则：

- 命名前缀就是契约：`getPublic*` 只能返回公开数据，`getAdmin*` 必须先鉴权
- **`visibility` 不允许作为公开查询的筛选参数**。如果哪天要「临时预览私密条目」，
  那也必须走 `getAdmin*`
- `getAdmin*` 一律**不加 `unstable_cache`**（站长一个人用，不需要缓存，加了反而危险）
- 写一个单元测试：遍历所有导出的 `getPublic*` 函数，往库里插一条 `private` 条目，
  断言这些函数**永远拿不到它**。这个测试是这套设计的保险丝。

### 铁律 3 · `public/` 目录下的文件是公开的

这一条最容易被忽略。Next.js 的 `public/` 目录**没有任何鉴权**，
`https://你的域名/icons/xxx.png` 任何人都能直接打开。

所以：**私密条目上传的图片绝对不能和公开图片放在一起。**

| 内容 | 存哪 | 怎么访问 |
|---|---|---|
| 公开条目的图标 / 二维码 / 封面 | `data/uploads/public/{icons,qrcodes,covers}/` | `/media/...`（生产环境 Caddy 直接读盘） |
| **私密条目的任何图片** | `data/uploads/private/{entryId}/` （**同样的卷，但走不同出口**） | `/api/file/...` 走鉴权路由 |

注意：**真正的隔离手段是「两个不同的访问路径」，不是「两个不同的目录」。**
`data/uploads/` 整个目录对公网都不可见 —— 公开图片靠 Caddy 的 `handle /media/*`
显式映射出去，私密图片没有任何映射，只能从 Node 的鉴权路由进出。
（顺带一提，`data/` 不在 `public/` 里，所以就算鉴权路由写错了，也只是 401 而不是被静态服务器直接吐出去。）

鉴权路由：

```ts
// src/app/api/file/[...path]/route.ts
export async function GET(req, { params }) {
  await requireAdmin()                       // ★ 不登录直接 401
  const p = path.join(PRIVATE_DIR, ...params.path)   // PRIVATE_DIR = UPLOAD_DIR/private
  if (!p.startsWith(PRIVATE_DIR)) return new Response('bad', { status: 400 })  // 防目录穿越
  const buf = await fs.readFile(p)
  return new Response(buf, {
    headers: {
      'Content-Type': mimeOf(p),
      'Cache-Control': 'private, max-age=0, no-store',   // ★ 绝不能被 CDN / 浏览器公共缓存
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
```

`Cache-Control: private, no-store` 是这个路由的命脉 ——
写成 `public` 的话，CDN 会把站长看到的图片缓存下来发给所有人。

---

## 三、`/me` 站长区域

`/admin` 是**管理台**（表格、批量、设置），`/me` 是**站长视角的前台**（用卡片舒服地逛自己的站）。

两者职责不同，都要有：

| | `/admin` | `/me` |
|---|---|---|
| 形态 | 表格 + 表单 | 前台的卡片网格 |
| 用来 | 改数据 | 看数据 |
| 数据 | 全部 | 全部 |
| 组件 | `DataTable` `EntryForm` | 复用前台 `EntryCard` `EntryGrid` `FilterPanel` |
| 缓存 | 不缓存 | 不缓存 |

路由：

```
/me                      私密首页：我的收藏 / 想去 / 最近添加 / 待办
/me/tools  /me/sites  /me/shops   各类型全量列表（含 public/unlisted/private）
/me/search               全量搜索（三种可见性都搜）
/me/notes                私人笔记流（把 entry_private.note 按时间排）
/me/settings             站点设置
/me/entries/[id]         私密条目详情（复用前台详情组件）
```

> 注意：**`/me` 下没有标签管理页。** 私密标签（`dim = 'private'`）和公开标签都在
> `/admin/tags` 里统一维护（`TagManager` 的维度顺序是六个公开维度 + `private`）。

布局：外面套一个简洁的站长外框（顶部一条「站长视图 · 返回公开站 · 退出」），
内容区完全复用前台的组件。**成本很低，因为前台组件本来就已经写好了。**

`/me` 下所有页面统一加响应头：

```
X-Robots-Tag: noindex, nofollow
Cache-Control: private, no-store
```

---

## 四、公开条目上的私密字段

有些内容不是「私密条目」，而是**公开条目上只有你能看到的备注**。
比如：「这家其实一般，别周末去」「老板微信 xxx」「实际人均 80 不是 50」。

表定义在 [`DATA-MODEL.md`](DATA-MODEL.md) 第 2.6 节（**那里是唯一的 schema 来源，不要在这里另写一份**）。
字段语义：

| 字段 | 用途 |
|---|---|
| `rating` | 我的评分 1-5 |
| `status` | `todo` 想去 / `visited` 去过 / `verified` 已验证 / `avoid` 踩雷 |
| `note` | 私人备注（多行） |
| `contact` | 老板微信 / 电话等不公开联系方式 |
| `paid` | 实际花费，如「人均 80」 |
| `visitedOn` | 到访日期 `YYYY-MM-DD` |

1:1 关系，只有 `/admin` 的编辑页和 `/me` 的详情页会读出它。
**公开详情页那条查询里根本不会 join 这张表** —— 从源头上就拿不到。

### 私密标签

给 `tags.dim` 增加一个 `'private'` 维度，让私密收藏也能被组织：

| slug | 名称 | 用途 |
|---|---|---|
| `todo` | 想去 | 还没去过的店 |
| `visited` | 去过 | 打过卡 |
| `fav` | 私藏 | 不想公开推荐的心头好 |
| `avoid` | 不推荐 | 去过但不行，留个记录免得再去 |
| `friend` | 朋友开的 | |

关键规则：**公开查询默认排除 `dim = 'private'` 的标签。**
在 `getPublicEntries` 关联标签时加 `ne(tags.dim, 'private')`，
否则「私藏」这种标签会出现在公开的筛选栏里，等于自曝。

**`entry_private.status` 和 `private` 标签的分工**（别造两套重复的）：

- `status` = **单值**，描述「我和这个店的关系阶段」，用于 `/me` 的分组看板
- `private` 标签 = **多值**，自由标记，用于筛选

---

## 五、站点级私密设置

存在 `settings` 表，`/me/settings` 和 `/admin/settings` 里编辑：

| key | 说明 | 默认 |
|---|---|---|
| `submissionsOpen` | 投稿开关，关掉后 `/submit` 显示「暂停收稿」 | `true` |
| `maintenanceMode` | 维护模式，前台显示公告页（站长仍可访问） | `false` |
| `defaultVisibility` | 新建条目默认可见性 | `'public'` |

---

## 六、几个必须处理的边界情况

**① 公开改私密时要刷新缓存**
把一条 `public` 条目改成 `private`，它的页面缓存里还留着公开版本。
`revalidatePath` 必须被调用，且要覆盖 `/`, `/tools`, `/tools/{slug}`, `/tags/...` 全部路径。
`src/lib/revalidate.ts` 里 `revalidateEntryPaths()` 要**同时处理改之前和改之后的可见性**。

**② 标签计数要跟着变**
「办公 (12)」里有 2 条改成私密，公开筛选栏必须变成「办公 (10)」，否则点进去只有 10 条，
用户会觉得站坏了 —— 而且这本身就在暗示「有隐藏内容」。

**③ 把公开条目改成私密时，slug 会「被占用」**
`unique(type, slug)` 是全表唯一。私密条目和公开条目不能同 slug —— 这是好事，
防止 `/tools/figma` 有两种含义。但要有提示：改了之后原 URL 会 404。

**④ `/go/[slug]` 要区分对待**
私密条目的外链跳转必须 `requireAdmin()`，否则等于给了一条免登录访问私密地址的旁路。
`unlisted` 的则正常放行。

**⑤ 投稿转私密**
投稿审核通过后生成的条目如果是私密，`submissions.result_id` 关联的那条记录
在 `/admin/submissions` 里正常显示（后台本来就都要鉴权），但不能出现在任何公开面。

**⑥ 导出备份包含私密数据**
`/admin/imports` 导出的 JSON 含私密条目，**这个文件不要放公共网盘、不要提交到 Git**。
在导出说明里写清楚。

**⑦ 访问统计不能变成追踪**
`/admin/analytics` 的访客数来自 `visit_daily`（见 [DATA-MODEL.md](DATA-MODEL.md) 2.9 / 4.5）。
它是这套设计里唯一和「人」沾边的数据，所以边界写死在这里：

| 存 | 不存 |
|---|---|
| `HMAC-SHA256(AUTH_SECRET, 'pv:{日期}:{IP}:{UA}')` 的前 32 位 | 原始 IP、原始 UA、任何设备指纹 |
| 按天聚合的浏览数、路径、来源域名 | 明细访问日志、搜索词、完整 referrer URL |
| —— | cookie、localStorage、第三方脚本 |

盐里带日期，所以**跨天无法关联同一个人**；「近 7 天访客」是每天去重后相加，
不是 7 天内的独立访客，页面上必须照这个说法写，不能含糊成「7 天有多少人」。
站长自己登录后的访问全部不计入 —— 否则你每次刷新都在给自己刷数字。

---

## 七、部署加固（可选但便宜）

**改掉后台路径（未实现 · 可选加固项）。** `/admin` 和 `/login` 是扫描器必扫的路径。
把前缀做成可配置的（环境变量 `ADMIN_PATH`，默认 `admin`），换成 `x7k2m` 这类无意义字符串，
能挡住大部分自动化扫描，成本几乎为零。

> ⚠️ **目前没有这个功能。** `src/middleware.ts` 的 matcher 是**硬编码**的
> `['/admin/:path*', '/admin', '/me/:path*', '/me']`，`requireAdmin()` 失败时也是写死跳 `/login`。
> 要做的话得同时改这两处（`middleware.ts` 的 `config.matcher` 和 `auth.ts` 的重定向），
> 另外别忘了后台里所有指向 `/admin/...` 的链接。

**站长模式工具条要显眼。** 登录后前台顶部固定一条细窄的条（主色底 + 白字）：
「站长模式 · 你正在看公开视图 · [进入 /me] [退出]」。
不是为了好看 —— 是为了**防止你自己搞混**：以为在看全部内容，其实是公开视图，
然后纳闷「我那条私密收藏怎么不见了」。

**登录失败要限速（未实现 · 待办）。** 现在 `src/lib/auth.ts` 的 `authorize` 在邮箱或密码不匹配时
只做了一件事：`await sleep(500)` —— **没有计数、没有锁定**，也就是说爆破只被拖慢，不会被挡住。
单管理员账号尤其需要补：同 IP 连续失败 5 次锁 15 分钟（计数放 `settings` 表或进程内存）。

---

## 八、验收清单

实现完私密层之后，逐条验证（**每一条都要真的去点一遍**）：

- [ ] 匿名访问 `/me` 和 `/me/anything` → 跳登录页
- [ ] 匿名直接访问某个 `private` 条目的公开 URL → **404**（不是 403，不是空白页）
- [ ] 匿名访问 `/tools`、`/tags/*`、`/search?q=私密条目名` → 搜不到任何私密内容
- [ ] 匿名访问 `/sitemap.xml` 和 `/feed.xml` → 不含私密条目
- [ ] 公开筛选栏的标签计数 = 公开列表的实际条数（不含私密）
- [ ] 私密条目上传的图片 URL，匿名直接打开 → 401，且响应头是 `Cache-Control: private, no-store`
- [ ] 公开条目的详情页 HTML 源码里，搜不到任何 `entry_private` 字段的值
- [ ] 站长登录后访问 `/tools`（公开视图）→ **内容和匿名看到的一模一样**（这是缓存安全的证明）
- [ ] 站长在 `/me/tools` → 能看到全部三种可见性的条目
- [ ] 把一条公开条目改成私密 → 前台 1 秒内消失，标签计数 -1，sitemap 里也没了
- [ ] 单元测试：往库里插一条 `private`，所有 `getPublic*` 函数都拿不到它
- [ ] 访问统计：无痕窗口看一次前台 → `/admin/analytics` 今日访客 +1；站长登录状态下再看 → 数字不动
- [ ] 访问统计：`curl` 和 Googlebot 的 UA 各请求一次前台 → 数字不动（爬虫不进统计）

最后一条写成自动化测试放进 `tests/privacy.test.ts`，跑在 CI 里。
**这条测试比其它十条加起来都重要** —— 它是唯一能在你以后加新查询函数时自动报警的东西。
