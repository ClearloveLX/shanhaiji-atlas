# 标签体系 — 山海集 Atlas

> 标签是本站的骨架。**先有标签，才能给条目打标签**；系统里不允许出现没注册过的标签值。
> 所有标签存在数据库 `tags` 表，通过后台 `/admin/tags` 可视化维护——加标签、改颜色、合并重复，
> 都不用改代码。代码里不硬编码任何标签文案或颜色。

---

## 1. 六个维度

同一条数据 = **1 个 `type`（类型）+ N 个维度标签**。

| 维度 | `dim` 值 | 中文 | 基数 | 必填 | 作用 |
|---|---|---|---|---|---|
| 类型 | `entries.type` | 类型 | 单值 | ✅ | 决定进哪张列表、详情页用哪个模板 |
| 场景 | `scene` | 场景 | 1–3 个 | ✅ 至少 1 个 | 首页「按场景逛」、主要 SEO 落地页 |
| 属性 | `attr` | 属性 | 0–4 个 | ❌ | 筛选主力（免费 / 免登录 / 需境外访问…） |
| 平台 | `platform` | 平台 | 0–3 个 | ❌ | 工具类条目的主要筛选维度 |
| 价格 | `price` | 价格 | 0–1 个 | ❌ | 工具 / 店铺可用 |
| 质量 | `quality` | 质量 | 0–2 个 | ❌ | 编辑侧标记，影响排序与角标 |

**基数上限是硬的**，由 `src/lib/validation.ts` 的 Zod schema 和后台 TagPicker 双重拦截。
`scene` 打超过 3 个就等于没打。

---

## 2. 初始标签字典（`pnpm db:seed` 灌入）

### 2.1 `scene` 场景（12 个）

| slug | 名称 | 收录什么 |
|---|---|---|
| `work` | 办公 | 文档、协作、流程、会议、表单 |
| `study` | 学习 | 课程、词典、笔记、论文、刷题 |
| `travel` | 出行 | 地图、机票、酒店、行程、翻译 |
| `home` | 居家 | 家装、清洁、收纳、维修、租房 |
| `health` | 健康 | 运动、睡眠、饮食记录、问诊、心理 |
| `money` | 理财 | 记账、比价、汇率、报销、税务 |
| `food` | 吃喝 | 外卖、菜谱、探店、生鲜 |
| `digital` | 数码 | 硬件、外设、系统工具、开发 |
| `kids` | 亲子 | 育儿、绘本、玩具、教育 |
| `pet` | 宠物 | 宠物用品、医疗、寄养 |
| `create` | 创作 | 设计、剪辑、写作、音乐、图片处理 |
| `fun` | 娱乐 | 影视、游戏、社区、摸鱼 |

### 2.2 `attr` 属性（8 个）

| slug | 名称 | 判定标准 |
|---|---|---|
| `free` | 免费 | 核心功能可长期免费使用，无强制付费墙 |
| `no-login` | 免登录 | 打开即用，不注册也能完成主要操作 |
| `open-source` | 开源 | 源码公开可查 |
| `zh-ui` | 中文界面 | 官方提供简体中文界面 |
| `no-install` | 免下载 | 纯网页 / 小程序，不需安装客户端 |
| `need-proxy` | 需境外访问 | 中国大陆直连不可用 |
| `maintained` | 长期维护 | 近 12 个月有更新记录 |
| `ads-free` | 无广告 | 无弹窗、无信息流广告、无诱导下载 |

### 2.3 `platform` 平台（6 个）

`web` 网页 · `ios` · `android` · `windows` · `macos` · `miniprogram` 小程序

### 2.4 `price` 价格（4 个）

| slug | 名称 | 说明 |
|---|---|---|
| `free` | 完全免费 | 无任何付费项 |
| `freemium` | 免费增值 | 免费可用，高级功能收费 |
| `onetime` | 一次性买断 | |
| `subscription` | 订阅制 | |

### 2.5 `quality` 质量（4 个）

| slug | 名称 | 说明 |
|---|---|---|
| `editor-pick` | 编辑精选 | **必须人工勾选**，全站不超过 15% |
| `high-repute` | 高口碑 | 有长期公开好评，非刷榜 |
| `new` | 新上线 | 收录 90 天内自动标记，由脚本维护 |
| `dead` | 已失效 | 与条目的 `status = 'dead'` 联动 |

---

## 3. `tags` 表结构

```ts
// src/db/schema.ts
export const tags = pgTable('tags', {
  id:    uuid('id').primaryKey().defaultRandom(),
  dim:   varchar('dim', { length: 12 }).notNull(),   // scene | attr | platform | price | quality
  slug:  varchar('slug', { length: 40 }).notNull(),
  name:  varchar('name', { length: 20 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),  // #RRGGBB
  icon:  varchar('icon', { length: 40 }),            // lucide 组件名
  desc:  text('desc'),                               // 标签聚合页正文，30-60 字
  sort:  integer('sort').notNull().default(0),
}, (t) => [uniqueIndex('tags_dim_slug_idx').on(t.dim, t.slug)])
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `dim` | ✅ | 五个维度之一，配合 `slug` 唯一 |
| `slug` | ✅ | 全小写英文 kebab-case，**不可随意改**（改了就是断链） |
| `name` | ✅ | 中文展示名，2–4 字最佳，后台可随时改 |
| `color` | ✅ | 十六进制，用于 chip 描边/底色，需满足白底 AA 对比度 |
| `icon` | ❌ | lucide-react 组件名，必须真实存在 |
| `desc` | ❌ | 一句话说明，渲染到标签聚合页顶部，**这是 SEO 正文，写满 30–60 字** |
| `sort` | ✅ | 后台可拖拽调整，决定筛选栏里的显示顺序 |

---

## 4. 使用规则

1. **先注册，后使用。** 标签必须先存在于 `tags` 表。后台的 TagPicker 支持在输入框里
   直接回车新建——但这是给"确实需要"准备的，不要因为懒而造重复标签。
2. **引用时带维度。** 代码里引用标签一律用 `${dim}/${slug}` 复合形式，
   避免 `attr.free`（免费使用）和 `price.free`（完全免费）混淆。
3. **不做同义标签。** 「免登录」和「无需注册」只能存在一个。
   发现重复就在 `/admin/tags` 用**合并**功能处理，不要手删。
4. **不做层级。** 标签不分父子，扁平就好。真要分组就调整 `sort` 和后台的展示分组。
5. **计数为 0 的标签保留。** 标签页照常渲染（带「暂无收录」提示 + 相关标签推荐），
   不要因为暂时没数据就删。空标签页本身也是给搜索引擎的信号。
6. **改 `slug` 要谨慎。** 改 `name` / `color` / `desc` / `sort` 随便改；
   改 `slug` 会让 `/tags/{dim}/{slug}` 断链——如果那个页面已经被搜索引擎收录，
   后台会提示你，需要在 `/etc/caddy/Caddyfile` 里加一条 301。
7. **一条条目的标签总数建议 3–8 个**，超过 8 个说明这条定位不清。

---

## 5. 三段式速记

```
{type} : {scene} : {attr}
```

| 条目 | 标签 |
|---|---|
| Figma | `type=tool` · `scene=create,work` · `platform=web,macos` · `price=freemium` · `attr=maintained` |
| 小红书 | `type=site` · `scene=fun,food,travel` · `platform=ios,android` · `attr=zh-ui` |
| 某咖啡店 | `type=shop` · `scene=food` · `price=freemium` · `meta.city=上海` |

UI 上 chip 的展示顺序**固定**为：`scene → attr → platform → price → quality`，
不要按查询返回顺序渲染，保证全站视觉一致。这个排序逻辑写在 `src/lib/tags.ts` 的 `sortChips()` 里。
