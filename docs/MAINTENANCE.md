# 日常维护手册 — 山海集 Atlas

> 这份手册的作用是：**让维护变成照着清单点几下，而不是"想起来才做"**。
> 每一条都写明了「打开哪个页面、点哪里、做到什么程度算完成」。
> 部署、备份、故障处理在 [`DEPLOY.md`](DEPLOY.md)，这里只讲日常。

---

## 一、频率与时间预算

| 频率 | 花多久 | 目的 | 做不完怎么办 |
|---|---|---|---|
| **每周** | 约 10 分钟 | 不让投稿和死链堆起来、不让二维码过期 | 保底做完 W1（投稿）和 W3（二维码），这两个最伤体验 |
| **每月** | 约 40 分钟 | 内容在增长、标签没走样、备份确实在跑 | 保底做完 M1（加内容）和 M4（看备份） |
| **每季** | 约 1 小时 | 演练恢复、留一份站外数据、看搜索收录 | **Q2（备份恢复）不能跳**，其余可顺延 |
| **每年** | 约半天 | 升级依赖、清账 | 分两次做也行，但**先开分支** |

登录入口：`https://你的域名/login`。后台是 `/admin`，站长视角（含私密内容）是 `/me`。

---

## 二、每周（约 10 分钟）

### W1 · 清投稿队列

- [ ] 打开 **`/admin/submissions`**（也可以从左侧边栏「投稿审核」进，旁边红点就是待审计数）。
- [ ] 停在 **「待审」** Tab，按提交时间从早到晚看。
- [ ] 逐条点 **「查看原链接」**，按 [`CONTENT-GUIDE.md`](CONTENT-GUIDE.md) 过一遍硬性门槛。
- [ ] 合格的：点 **「通过」** → 会跳到 `/admin/entries/new` 且表单已预填 →
      **补齐场景标签**（至少 1 个 `scene`）→ 点「保存」。保存后回 `/admin/submissions`
      确认这条已从「待审」移到「已通过」，并记了 `result_id`。
- [ ] 不合格的：点 **「拒绝」**，从下拉里选一个原因
      （链接失效 / 不符合收录标准 / 重复 / 垃圾信息）。**别留空**，
      下次遇到同一个人投稿，这个原因就是判断依据。
- [ ] 顶部标注超过 7 天未处理的条目标红 —— **这周必须清零**。

做到什么程度算完成：**「待审」Tab 空了，或剩下的都是这 7 天内新提交的。**

### W2 · 跑一次死链巡检

- [ ] 本地开发机上跑：

  ```powershell
  cd 你的项目目录
  pnpm check-links
  ```

  期望输出：`检查 N 条：正常 x / 死链 y / 判不了 z（耗时 ws）`，下面列出失败的条目名，
  每条前面标了 `[死链]` 或 `[判不了]`。

  - **死链** = 404 / 410（深层链接）、域名解析不到、连接被拒 —— 这种才要你处理
  - **判不了** = 站点拒绝机器人（403 / 406）、限流（429）、5xx、8 秒超时、证书链问题、
    首页直接回 404（小红书这类就是拿 404 拦爬虫）—— 只记录，不动状态

  输出里还有一段「跳过 N 条（要外网才能打开）」：ChatGPT / Gemini / Claude / Grok /
  Mistral / Llama / HuggingFace 这一批，国内机房直连只会超时，所以巡检**根本不发请求**，
  它们的死活靠下面 W2 最后一步手动标记。名单在 `src/lib/link-check.ts` 的
  `DEFAULT_SKIP_HOSTS`，也可以用 `LINK_CHECK_SKIP_HOSTS` 覆盖（逗号分隔，空串 = 一条都不跳）。
- [ ] 服务器侧也可以手动触发同一个巡检（接口要带 token）：

  ```bash
  curl -fsS -H "x-cron-token: $(grep '^CRON_TOKEN=' /opt/atlas/.env | cut -d= -f2-)" \
    https://你的域名/api/cron/link-check
  ```

  想让服务器每天自己跑，就给 atlas 的 crontab 加一行（**可选**；不加就永远是手动跑）：

  ```bash
  crontab -u atlas -e
  # SHELL=/bin/bash
  # 0 4 * * * curl -fsS -H "x-cron-token: $(grep '^CRON_TOKEN=' /opt/atlas/.env | cut -d= -f2-)" https://你的域名/api/cron/link-check 2>&1 | logger -t atlas-linkcheck
  ```

- [ ] 打开 **`/admin/entries`**，用筛选器筛 **`status = stale`**，看这一周新增了哪几条。
- [ ] **需要外网的站（跳过名单里那些）手动扫一眼**：筛 `status = active`、按更新时间排序，
      挨个点「查看原链接」；打不开就当场把状态改成「疑似失效」或「已失效」。

⚠️ 巡检脚本**不会**把条目自动标成 `dead` —— **连续 2 次「死链」**的才标 `stale`（疑似失效），
「判不了」的（被拦、超时、5xx）连 `stale` 都不会标，只留在 `link_checks` 里备查。
`dead` 一律人工确认。脚本只负责提示，判断权在你手里（见 M3）。

### W3 · 看一眼快过期的二维码

- [ ] 打开 **`/admin/qrcodes`**。
- [ ] 页面按过期时间排序：**3 天内到期标黄、已过期标红**。
      ⚠️ 标红只是提醒 —— **`is_active` 不会自己变成 false**，得有人调 `sweepExpiredQrcodes()`
      （见下面那条 cron，或者点页面上的 **「一键停用所有已过期的码」** 按钮）。
- [ ] 让服务器每天自动停用过期码（**没配这一步，"过期自动下架"就不会发生**）：

  ```bash
  crontab -u atlas -e
  # SHELL=/bin/bash
  # 10 4 * * * curl -fsS -H "x-cron-token: $(grep '^CRON_TOKEN=' /opt/atlas/.env | cut -d= -f2-)" https://你的域名/api/cron/qrcodes 2>&1 | logger -t atlas-qrcodes
  ```

  不想配 cron 也行：每周打开 `/admin/qrcodes` 点一次 **「一键停用所有已过期的码」**
  （走 `deactivateExpiredQrcodes`，后台手动触发）。
- [ ] 黄色的：找店主要一张新码，点该行 **「编辑」** → 上传新图 → 把 `expires_at` 改到新的有效期 → 保存。
      微信群码的有效期就是 **7 天**，别指望它能撑到下周。
- [ ] 红色的：确认新码是否已经上传；如果这家店不进新群了，直接 **「下架」**（`is_active = false`），
      不要留着让访客扫出「该二维码已过期」。

上传注意：二维码图片必须传到自己的服务器（走 `data/uploads/public/qrcodes/`），
**不许外链微信或第三方图床**，也不要把边长压到 430px 以下 —— 微信识别对清晰度很敏感。

### W4 · 看一遍首页排版

- [ ] 打开 **`https://你的域名/`**，从上到下看这五块：
      Hero 与搜索框 → 「编辑精选」横滑条 → 三个入口大卡（工具/站点/店铺）→ 「按场景逛」→ 「最新收录」。
- [ ] 具体看三件事：**有没有裂图**（图标 404 / 长宽比被压扁）、**卡片标题有没有超长把布局撑破**、
      **「最新收录」里有没有明显不该出现的条目**（测试条目、私密条目、已失效的）。
- [ ] 手机宽度再看一遍（浏览器 F12 → 切到 375px）：横滑条能不能滑、筛选栏有没有挡住内容。
- [ ] 排版有问题的那一条，直接进 `/admin/entries` 搜到它 → 行内改状态或进编辑页改文案。

### W5 · 顺手两件事（30 秒）

- [ ] 看左侧边栏有没有红点：「条目管理」旁的数字是 `stale` 数量，「投稿审核」旁是待审数。
- [ ] 打开 **`/admin/trash`**（回收站），本周误删的东西在这里恢复；确认没有需要恢复的就不用动。

---

## 三、每月（约 40 分钟）

### M1 · 加 10-20 条收录

- [ ] 打开 **`/admin/entries/new`**，第一步先选形态（这一步决定后面显示哪些字段）：

  | 选哪个 | 什么时候选 | 链接 |
  |---|---|---|
  | 外部链接 | 推荐别人做的网站 / 工具 / 网店 | `/admin/entries/new?mode=external` |
  | 自研工具 | 自己做的、跑在站内的工具 | `/admin/entries/new?mode=internal` |
  | 线下好店 | 有实体地址的店 | `/admin/entries/new?mode=place` |

- [ ] 一条一条填。**必填的三样**：名称、`summary`、至少 1 个 `scene` 标签。
      文案怎么写、标签怎么打，照 [`CONTENT-GUIDE.md`](CONTENT-GUIDE.md) 来。
- [ ] 线下店：地址填完等地理编码回填经纬度，**在静态地图上看一眼那个点对不对**
      （API 经常定到马路对面或同名小区），不对就点「位置不对？手动调整」拖一下再保存。
      一个品牌一条条目，多家门店在表单里加多条门店，**不要一家店建一条条目**。
- [ ] 自研工具：组件名从下拉里选，必须和 `src/tools/registry.ts` 里注册的 key 一致，
      对不上的服务端会直接拒收。
- [ ] 保存后去 `/tools`、`/sites`、`/shops` 各看一眼，确认新条目出现了（没出现就是缓存没刷，看第七条红线）。
- [ ] 顺手检查：`featured`（精选）和 `quality/editor-pick` 标签的占比别越过 15% 红线，
      算法见 [`CONTENT-GUIDE.md`](CONTENT-GUIDE.md)。

目标：**每月净增 10-20 条**。一个月一条没加，三个月后这个站就没内容了。

### M2 · 合并重复标签

- [ ] 打开 **`/admin/tags`**。
- [ ] 按维度 Tab 切过去（场景 / 属性 / 平台 / 价格 / 质量），逐个看有没有同义标签
      —— 典型的是「免登录」和「无需注册」并存、「办公」和「工作」并存。
- [ ] 找到重复的：勾选 **2 个以上同维度**的标签 → 点 **「合并」** → 选**保留哪一个**
      → 确认（会二次确认，合并是不可逆的）。
      合并会在一个事务里把条目引用改到保留的标签上，然后删掉其余的。
- [ ] 合并完回 `/admin/entries`，按保留的那个标签筛一下，**看条目数对不对**。
- [ ] 顺手看标签的 `desc`（标签页正文，30-60 字）是不是空的 —— 空着的补一句，
      这是标签页的 SEO 正文，不是装饰。
- [ ] 计数为 0 的标签**保留**，不要删（空标签页本身也是给搜索引擎的信号）。

### M3 · 处理「疑似失效」

- [ ] 打开 **`/admin/entries`** → 筛选 **`status = stale`**（左侧边栏「条目管理」旁的红点也指向这里）。
- [ ] 逐条点进去，手工打开它的链接，按三档处理：

  | 情况 | 操作 |
  |---|---|
  | 能打开，只是当时网络抖动 / 403 挡了 HEAD | 状态改回 `active`（列表里可以直接切，不用进编辑页） |
  | 确实打不开，但换了个域名/新版地址 | 更新 `url`（仍然只能通过 `/go/{slug}` 对外），状态改回 `active` |
  | 确实死了、也找不到替代 | 状态下拉改 **`dead`** —— `dead` 只由人工确认，脚本永远不会自动改 |

- [ ] 判断不出来的先放着，下周再点一次；**不要因为懒得判断就批量改成 `dead`**，
      `dead` 的条目点进详情页会看到「这个链接可能已经失效」。

### M4 · 确认备份在生成

- [ ] 打开服务器：

  ```bash
  ls -lht /opt/atlas/data/backups | head -5
  du -sh /opt/atlas/data/backups
  ```

- [ ] 看**最新一份的日期是不是今天或昨天**，文件名形如 `atlas-2026-10-15.db.gz`。
- [ ] 日期不对就往回查：

  ```bash
  journalctl -t atlas-backup --since "14 days ago" | tail -40
  crontab -u atlas -l | tail -3
  df -h /
  ```

  常见原因只有三个：crontab 那行掉了、磁盘满了、`sqlite3` 命令找不到。
- [ ] 顺手把备份目录的大小记一眼：30 份压缩后的库应该只有几十到几百 MB，
      **突然变成几个 GB 说明某个表在疯长**（通常是 `click_logs` 或 `link_checks`）。

### M5 · 顺手两件事

- [ ] `df -h /` —— 使用率超过 80% 就先去清 releases（只留 3 个）和 Caddy 日志。
- [ ] `free -m` —— used 应该在 300 MB 以内；swap 长期被占说明内存涨了，
      去查是不是多装了常驻进程。

---

## 四、每季（约 1 小时）

### Q1 · 导出全站 JSON 存到本地

- [ ] 打开 **`/admin/imports`** → 点 **「导出」**，下载全站 JSON。
- [ ] 存到本地开发机的固定目录，例如 `你的导出目录`，
      文件名带上日期：`atlas-export-2026-10-15.json`。
- [ ] ⚠️ 导出的 JSON **包含私密条目和私人备注**。页面上的红字提示不是客套话：
      **不要放公共网盘、不要提交进 Git、不要发给别人。**
- [ ] 这一份是"数据库整个坏掉、备份也读不出来"时的最后一道保险，
      所以它必须存在于**服务器之外**。

### Q2 · 实测一次从备份恢复（不能跳）

先做不覆盖线上库的演练：

- [ ] ```bash
      gunzip -c /opt/atlas/data/backups/atlas-2026-10-15.db.gz > /tmp/atlas-verify.db
      sqlite3 /tmp/atlas-verify.db "PRAGMA integrity_check;"        # 期望 ok
      sqlite3 /tmp/atlas-verify.db "select count(*) from entries;"   # 和后台显示的条数对得上
      rm -f /tmp/atlas-verify.db
      ```
- [ ] 条目数对不上、或者 `integrity_check` 不是 `ok` → **立刻停下来排查**
      （见 [`DEPLOY.md`](DEPLOY.md) 第十一节），这比恢复失败更严重：
      说明备份一直在产出坏文件。

每年至少真跑一次完整的恢复（会停服务几十秒，挑没人的时候）：

- [ ] ```bash
      /opt/atlas/scripts/restore.sh /opt/atlas/data/backups/atlas-2026-10-15.db.gz
      ```
      脚本会要求输入 `yes`、先把当前库另存为 `atlas-before-restore-20261016-120000.db`，
      然后才替换、重启、打印条目数。
- [ ] 恢复完打开首页和后台，确认内容和恢复前一致；
      然后**把 `atlas-before-restore-*.db` 留几天再删**，那是唯一的退路。

> **没实测过的备份等于没有备份。** 这一条是整份手册里最不能省的一步。

### Q3 · 检查搜索引擎收录

- [ ] **Google Search Console** → 「索引编制 → 网页」看覆盖率，
      重点看「已发现但未编入索引」和「已抓取但未编入索引」在涨还是跌。
- [ ] **Bing Webmaster Tools** → 同样看已编入索引的页面数（第一次配置见 [`SEO-CHECKLIST.md`](SEO-CHECKLIST.md)）。
- [ ] 搜 `site:你的域名` 看大致收录量，和 `/sitemap.xml` 里的 URL 数对一下
      （差得太多说明有大批页面没被收录）。
- [ ] 抽查 3 个标签页（例如 `/tags/scene/work`、`/tags/attr/no-login`、`/tags/price/free`）
      **在搜索结果里**的标题和描述是不是正常的，而不是「无标题」或一串 URL。
- [ ] ```bash
      curl -sS https://你的域名/sitemap.xml | grep -c '<url>'
      ```
      这个数字 = 公开条目数 + 标签数 + 静态页，和前两个月比**只应该增加**。

### Q4 · 顺手两件事

- [ ] `free -m` + `systemctl list-units --type=service --state=running`：
      确认跑着的服务还是只有 atlas 和 caddy（没有悄悄多出别的东西）。
- [ ] `journalctl -u atlas --since "90 days ago" | grep -ci error`
      —— 数量级看一眼，明显异常再去翻上下文。

---

## 五、每年

### Y1 · 升级 Next.js 和 Node（先开分支）

- [ ] **先开分支，不要在 main 上试**：

  ```powershell
  cd 你的项目目录
  git checkout -b chore/upgrade-2027
  pnpm outdated
  ```

- [ ] 改 `package.json` 里的版本（Next 和 `eslint-config-next` 必须同版本），然后：

  ```powershell
  pnpm install
  pnpm lint
  pnpm typecheck
  pnpm build
  pnpm start        # 本地 http://localhost:4000 手点一遍：首页/列表/详情/标签页/后台登录
  ```

- [ ] 本地全过之后，按 [`DEPLOY.md`](DEPLOY.md) 第七节发布；盯 30 分钟日志：

  ```bash
  journalctl -u atlas -f
  ```

- [ ] 出问题立刻回滚软链（DEPLOY.md 第十节），回到分支上继续修。
- [ ] **升 Node 不用动 `better-sqlite3`。** 它从 v13 起走 N-API 预编译包
      （包内直接带 `prebuilds/{linux,linuxmusl,darwin,win32}-{x64,arm64}.node` 八个平台），
      **不绑 Node 的 ABI** —— 服务器 Node 主版本和本地不一致也照样跑，
      升完**不需要**重装它，也不会报 `NODE_MODULE_VERSION` 不一致。
      升级步骤：NodeSource 换主版本 → 重新构建并传到新 release 目录 → 换软链 → `systemctl restart atlas`。
- [ ] 升完把这一条写进 `docs/DEPLOY.md` 的「一年后要检查什么」里，注明日期。

### Y2 · 域名和证书

- [ ] 查域名到期日（注册商控制台），**续费提醒提前一个月**。
- [ ] 证书是否还在自动续期：

  ```bash
  systemctl status caddy --no-pager | head -5
  journalctl -u caddy --since "30 days ago" | grep -i -E 'certificate|renew' | tail -20
  curl -vI https://你的域名 2>&1 | grep -i expire
  ```

- [ ] 到期时间正常（还有几十天）说明 Caddy 的自动续期没坏；
      如果只剩几天或已经报过期，按 [`DEPLOY.md`](DEPLOY.md) 12.2 排查。

### Y3 · 清理无用标签

- [ ] 打开 **`/admin/tags`**，按每个维度看一遍：
      - 名字相近、语义重复的 → 用**合并**处理（见 M2）。
      - 用错维度的（比如把「免登录」打成了 `scene`）→ 先批量改到正确维度，再合并。
      - 计数为 0 的**保留**（TAGS.md 的规则），但连续两年都是 0 的可以考虑收拢。
- [ ] 清完随手看一眼首页「按场景逛」：字号分三档是按计数来的，标签合并后计数会变，
      如果某个场景突然变成最小字号、而且确实没内容可加，考虑把它降级。
- [ ] ⚠️ **不要改已收录标签的 `slug`**：`/tags/{dim}/{slug}` 会断链，
      搜索引擎收录的页面直接变 404。改 `name` / `color` / `desc` / `sort` 随便改。

### Y4 · 磁盘占用清账

- [ ] ```bash
      df -h /
      du -sh /opt/atlas/* | sort -h
      du -sh /opt/atlas/data/*
      ls -1t /opt/atlas/releases
      ```

- [ ] 依次处理：
      - `releases/` 超过 3 个 → `cd /opt/atlas/releases && ls -1t | tail -n +4 | xargs -r rm -rf`
      - 备份目录过大 → 正常的 30 份不该超过几百 MB，超了先查库是不是被某个表撑大
      - `/var/log/caddy/` 老日志 → Caddyfile 里配了 `roll_size 10mb / roll_keep 5`，正常不会失控
      - 方案 B 构建过 → `pnpm store prune` 回收 store
- [ ] 最后确认一次：**`/opt/atlas/data/` 里没有多出奇怪的临时文件**，
      `.env` 里 `ADMIN_PASSWORD` 这一行**已经删掉**。

---

## 六、维护红线（每次动手前扫一眼）

1. **永远不要在 `/opt/atlas/current/` 里改文件、传产物或构建** —— 那是正在被读取的目录。
2. **备份只能 `sqlite3 .backup`，不能 `cp`** —— WAL 模式下 cp 出来的库不一致。
3. **上传的图片只能落 `data/uploads/`**，不许写进 `public/`（下次部署全丢）。
4. **改完数据要去前台看一眼**是否立刻可见；看不到就是 `revalidatePath` 没覆盖到，
   回后台再保存一次，并在代码里把对应路径补上（这是这个项目最容易出的 bug）。
5. **所有删除都是软删除**（进 `/admin/trash` 可以恢复）；危险操作都会二次确认，别手抖点过去。
6. **私密内容只出现在 `/me/*`**；公开页面（含登录后）永远只显示 `public` 条目。
   如果哪天在公开页面看到了私密条目，**先下线站点再查**，这属于静默泄漏。
7. **不要手工执行 `drizzle/*.sql`**，迁移一律走迁移器（DEPLOY.md 第九节）。
8. **不要在服务器上装 Docker / PostgreSQL / Redis**，也不要在服务器上跑 `pnpm build`
   （除非是 DEPLOY.md 第八节那种"人在外面"的情况）。

---

## 七、服务器命令速查

```bash
# 状态
systemctl is-active atlas caddy
ls -l /opt/atlas/current
free -m; df -h /

# 日志
journalctl -u atlas -n 100 --no-pager
journalctl -u atlas -f
journalctl -t atlas-backup --since "14 days ago" | tail -40

# 备份 / 恢复
/opt/atlas/scripts/backup.sh
/opt/atlas/scripts/restore.sh /opt/atlas/data/backups/atlas-YYYY-MM-DD.db.gz

# 库直查（只读）
sqlite3 /opt/atlas/data/atlas.db "select count(*) from entries;"
sqlite3 /opt/atlas/data/atlas.db "select status, count(*) from entries group by status;"
sqlite3 /opt/atlas/data/atlas.db "select count(*) from submissions where status='pending';"
```
