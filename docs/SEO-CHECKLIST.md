# 上线后 SEO 待办清单 — 山海集 Atlas

> 上线**当天**做完 A 区八条，之后按 B 区的复检周期看数。
> 每条都带「怎么验证」—— 命令行能验的都给命令，界面能验的写清点哪里。
> 目标值先摆出来，免得"感觉还行"：

| 指标 | 目标 | 在哪看 |
|---|---|---|
| `sitemap.xml` 可访问 | 200，且 URL 数是**绝对地址** | GSC / Bing / `curl` |
| 已编入索引的页面数 | 2 个月内达到 sitemap URL 数的 80% 以上 | GSC 覆盖率报告 |
| 标签页 title / description | **一个都不能为空** | S3 的循环脚本 |
| JSON-LD | 0 个错误、0 个"严重"警告 | Rich Results Test |
| 移动端可用性 | 无「文字过小」「可点击元素过密」类问题 | Lighthouse 移动端 / GSC |
| 首页 LCP（移动 4G） | **< 2.5s** | PageSpeed Insights / Lighthouse |
| 首页 TTFB | < 0.6s | `curl -w` |

下面所有命令里的 `https://你的域名` 换成实际域名再执行。

---

## 一、A 区：上线当天必做（八条）

### A1 · 站点验证（Google Search Console + Bing Webmaster Tools）

- **做什么**
  1. 打开 [Google Search Console](https://search.google.com/search-console) → 「添加资源」→
     选 **网域**（推荐，覆盖 `www` 和非 `www`）或「网址前缀」。
  2. 验证方式选 **DNS 域名验证**：GSC 会给一条 TXT 记录，
     去域名商控制台加到 DNS 里，回来点「验证」。
     —— 用 DNS 验证的好处是**永久有效**，重新部署不会把验证搞丢。
  3. 另一种：**HTML 文件验证**，把给的文件放进仓库的 `public/` 目录并提交进 Git。
     它会随每次部署被带到服务器上，所以也不会丢；但**不要**把这个文件放进 `data/uploads/`。
  4. Bing：[Bing Webmaster Tools](https://www.bing.com/webmasters) → 「从 GSC 导入」最省事；
     没有 GSC 就用同样的 DNS TXT 或 HTML 文件方式。
- **怎么验证**
  ```bash
  # 用 DNS 验证的：能看到 TXT 记录
  dig +short TXT 你的域名 | grep -i google-site-verification
  # 用文件验证的：文件能公开访问（把文件名换成实际拿到的那个）
  curl -sS -o /dev/null -w "%{http_code}\n" https://你的域名/google1234abcd.html
  ```
- **通过标准**：GSC 和 Bing 后台都显示「已验证」，且资源是你要的那个域名。

- [ ] A1 完成

### A2 · 提交 sitemap

- **做什么**
  1. GSC → 左侧「索引 → Sitemaps」→ 输入 `sitemap.xml` → 「提交」。
     完整地址是 `https://你的域名/sitemap.xml`，输入框里通常只填 `sitemap.xml` 就行。
  2. Bing Webmaster Tools → 「Sitemaps」→ 提交同一个地址。
  3. `robots.txt` 里也写了 sitemap 的完整地址（见 A3），搜索引擎会自己找到，
     但**手动提交一次**能立刻触发抓取，值得花这 30 秒。
- **怎么验证**
  ```bash
  curl -sS -o /dev/null -w "http %{http_code}  type %{content_type}\n" https://你的域名/sitemap.xml
  curl -sS https://你的域名/sitemap.xml | grep -c '<url>'
  curl -sS https://你的域名/sitemap.xml | head -20
  ```
- **通过标准**：状态码 200，`content_type` 是 XML；`<url>` 数量 = 公开条目数 + 标签数 + 静态页数；
  GSC 里那条 sitemap 的状态是「成功」，且"发现的网页数"和上面这个数字对得上。
- ⚠️ 条目数超过 5000 时 sitemap 会分片（`sitemap.xml` 变成索引文件，指向 `sitemap/0.xml` 等），
  这时 GSC 里提交索引文件本身即可，不用逐片提交。

- [ ] A2 完成

### A3 · 检查 robots.txt

- **做什么**：确认规则都在，且没把该收录的东西挡住。
  这份文件由 `src/app/robots.ts` 生成，改代码而不是改服务器上的文件。
- **怎么验证**
  ```bash
  curl -sS https://你的域名/robots.txt
  ```
  期望看到的内容（地址必须是完整地址）：
  ```
  User-Agent: *
  Allow: /
  Disallow: /admin
  Disallow: /me
  Disallow: /api
  Disallow: /login
  Disallow: /go/

  Sitemap: https://你的域名/sitemap.xml
  Host: https://你的域名
  ```
  再顺手确认这两条：
  ```bash
  curl -sS -o /dev/null -w "%{http_code}\n" https://你的域名/admin      # 期望 302/307 到登录页
  curl -sS -o /dev/null -w "%{http_code}\n" https://你的域名/me         # 期望 302/307 到登录页
  curl -sSI https://你的域名/me | grep -i -E 'x-robots-tag|cache-control'
  ```
- **通过标准**：`robots.txt` 是 200 且内容如上；`/admin`、`/me` 匿名访问都被重定向到登录页。
- 💡 `Disallow: /me` **已经在 `src/app/robots.ts` 里了**（上面期望内容里的第 3 条），
  不用再补。它和响应头 `X-Robots-Tag: noindex, nofollow` 是两道独立防线：
  前者管「还没抓的别来抓」，后者管「已经抓到的别索引」。
  如果 `/me` 曾经被收录进索引，去各站长平台各提交一次移除请求 —— 光靠响应头，
  索引里的旧条目不会自己消失。

- [ ] A3 完成

### A4 · 检查 sitemap.xml 的内容（不只是能不能打开）

- **做什么**：确认它**没有**泄露任何不该出现的东西，且地址形态正确。
- **怎么验证**
  ```bash
  # 1. 必须是绝对地址，不能是 /tools/figma 这种相对路径
  curl -sS https://你的域名/sitemap.xml | grep -c '<loc>https://你的域名'

  # 2. 不能出现私密路由（期望 0）
  curl -sS https://你的域名/sitemap.xml | grep -c '/me/'
  curl -sS https://你的域名/sitemap.xml | grep -c '/api/'
  curl -sS https://你的域名/sitemap.xml | grep -c '/admin'

  # 3. lastmod 必须来自条目的 updated_at，连续两次请求应该【完全一致】
  curl -sS https://你的域名/sitemap.xml | grep -o '<lastmod>[^<]*' | head -3
  sleep 3
  curl -sS https://你的域名/sitemap.xml | grep -o '<lastmod>[^<]*' | head -3
  ```
  第 4 步还可以做一次"私密条目不在 sitemap 里"的验证：
  在后台把某条公开条目临时改成 `private`，等几秒，再拉一次 sitemap，确认它的 URL 没了，
  然后把可见性改回来（这是 [`PRIVACY.md`](PRIVACY.md) 验收清单里的一条，值得真的做一次）。
- **通过标准**：全部 `<loc>` 都是绝对地址；`/me/`、`/api/`、`/admin` 计数都是 0；
  两次请求的 `lastmod` 一致（如果每次都在变，说明用了 `new Date()`，去改 `src/app/sitemap.ts`）。

- [ ] A4 完成

### A5 · 用 Rich Results Test 验证 JSON-LD

- **做什么**
  1. 打开 [Rich Results Test](https://search.google.com/test/rich-results)，输入三个代表性 URL：
     首页、一个工具详情页（`/tools/<slug>`）、一个标签聚合页（`/tags/scene/work`），点「测试网址」。
  2. 对照预期类型：首页 `WebSite`（带 `SearchAction`）；
     工具详情 `SoftwareApplication`；站点详情 `WebSite`；店铺详情 `Store`；
     标签页 `CollectionPage` + `ItemList` + `BreadcrumbList`。
- **怎么验证（命令行，先本地确认 JSON 能解析）**
  ```bash
  curl -sS https://你的域名/tools/figma -o /tmp/atlas-page.html
  python3 - <<'PY'
  import json, re
  html = open('/tmp/atlas-page.html', encoding='utf-8').read()
  blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
  print('找到 JSON-LD 段数：', len(blocks))
  for i, b in enumerate(blocks, 1):
      data = json.loads(b)          # 解析失败会直接抛错，说明转义写坏了
      print(f'  {i}. @type =', data.get('@type'))
  PY
  ```
- **通过标准**：`json.loads` 不报错（说明 `</` 转义正确、没有语法错误）；
  Rich Results Test 里没有「严重」错误；段落类型和上面列的预期一致。
- 常见错误：`@type` 写成了小写（`softwareapplication`）、`offers`/`aggregateRating` 塞了假数据、
  中文引号导致 JSON 非法。**不要为了多拿星标去编造评分数据。**

- [ ] A5 完成

### A6 · 每个标签页的 title / description 都不能为空

- **做什么**：标签页是主要的 SEO 落地页，标题和描述为空等于把这些页面白送。
  生成逻辑在 `src/lib/seo.ts`（`buildMetadata`），标签自己的 30-60 字说明在 `tags.desc`。
- **怎么验证（把所有标签页跑一遍，缺的直接列出来）**
  ```bash
  sqlite3 /opt/atlas/data/atlas.db "select dim || '/' || slug from tags where dim <> 'private' order by dim, sort;" |
  while read -r p; do
    html="$(curl -sS "https://你的域名/tags/$p")"
    title="$(printf '%s' "$html" | grep -o '<title>[^<]*</title>' | head -1)"
    desc="$(printf '%s' "$html" | grep -o 'name="description" content="[^"]*"' | head -1)"
    if [ -n "$title" ] && [ -n "$desc" ]; then
      printf 'OK   %-24s %s\n' "$p" "$title"
    else
      printf '缺   %-24s title=%s desc=%s\n' "$p" "$title" "$desc"
    fi
  done
  ```
  顺带看一眼描述是不是"有内容"，而不是把标题重复一遍：
  ```bash
  curl -sS https://你的域名/tags/scene/work | grep -o 'name="description" content="[^"]*"'
  ```
- **通过标准**：上面那段脚本**没有一行输出「缺」**；
  每个标签页的 description 都是那个标签自己的 30-60 字说明（在 `/admin/tags` 里维护 `desc`），
  不是全站一句通用文案。
- ⚠️ 标签的 `desc` 空着就是这种情况的根源。去 `/admin/tags` 逐个补齐，
  这是每季度检查清单里的一项。

- [ ] A6 完成

### A7 · 移动端可用性

- **做什么**
  1. Chrome DevTools → 设备工具栏切到 **iPhone SE / 375px**，逐页手动过一遍：
     首页、`/tools`、`/shops/map`、`/tags/scene/work`、一个详情页、`/submit`。
  2. 重点看四处：筛选栏是不是收进了 Sheet 且能开关、首页横滑条能不能滑、
     卡片标题有没有溢出、`/shops/map` 的地图在窄屏能不能拖动（地图手势别被页面滚动吃掉）。
  3. 跑一次 Lighthouse（DevTools → Lighthouse → **Mobile** → 生成报告）。
- **怎么验证**
  ```bash
  # viewport 必须存在，否则手机会按桌面宽度渲染
  curl -sS https://你的域名/ | grep -o '<meta name="viewport"[^>]*>'

  # 后台页面必须能被搜索引擎忽略（顺带确认没被误开放）
  curl -sS -o /dev/null -w "%{http_code}\n" https://你的域名/admin/entries
  ```
- **通过标准**：viewport 存在；Lighthouse 移动端无「可点击元素间距过小 / 文字过小」类问题；
  375px 下没有横向滚动条；GSC 的「移动设备易用性」报告没有新增问题。

- [ ] A7 完成

### A8 · 首页 LCP 在 4G 下 < 2.5s

- **做什么**
  1. [PageSpeed Insights](https://pagespeed.web.dev/) 输入首页地址，看 **移动端** 的 Core Web Vitals
     （它用的是真实的移动网络+降速环境）。LCP 目标 **< 2.5s**。
  2. 本地复现：DevTools → Lighthouse → Mobile（默认就是 Slow 4G + 4 倍 CPU 降速）。
  3. 先看服务端时间，再看前端：
- **怎么验证**
  ```bash
  # TTFB：目标 < 0.6s（LCP 预算 2.5s 里，服务端最多占这么多）
  curl -o /dev/null -sS -w "dns %{time_namelookup}s  connect %{time_connect}s  ttfb %{time_starttransfer}s  total %{time_total}s\n" \
    https://你的域名/

  # 首屏 HTML 大小：目标 < 60 KB（压缩前）
  curl -sS https://你的域名/ -o /tmp/atlas-home.html && ls -lh /tmp/atlas-home.html

  # 静态资源是否走了 Caddy 的缓存与压缩
  curl -sSI https://你的域名/media/icons/任意已有图标.png | grep -i -E 'cache-control|content-encoding'
  ```
  再看首页 First Load JS（本地 `pnpm build` 的输出里，首页那一行），
  基线是 Next + React 约 100 kB：**明显超过 250 kB 就要查**是不是把某个大依赖打进了首屏。
- **通过标准**：PageSpeed Insights 移动端 LCP < 2.5s、TTFB < 0.6s；
  首页图片走 `/media/*` 且有 `Cache-Control: ... immutable`；
  首屏没有未优化的巨大图片（首页封面图应该是 webp、宽度 800 左右）。
- 不达标时的排查顺序：① TTFB（服务器/内存）→ ② 首屏图片体积与尺寸 →
  ③ First Load JS → ④ 字体（`next/font` 是否用了 `display: swap`）。
  **不要**为了这个去上 CDN，先看清是哪一段慢。

- [ ] A8 完成

---

## 二、B 区：提交之后的复检

### B1 · 第 3 天：确认被抓取了

- **怎么验证**
  ```bash
  curl -sSI https://你的域名/ | grep -i -E 'x-vercel|server|cache-control'
  ```
  以及：GSC → 「网址检查」输入首页地址 → 看「已编入索引」还是「已发现 - 尚未编入索引」。
- **通过标准**：GSC 里出现抓取记录；`robots.txt` 报告里没有「被 robots.txt 屏蔽」的意外条目。
- **如果一直是「已发现 - 尚未编入索引」**：先看是不是内容太薄（标签页 `desc` 没写）、
  或者 sitemap 里有大量重复页面，而不是先去怪搜索引擎。

- [ ] B1 完成

### B2 · 第 2 周：看覆盖率

- **怎么验证**：GSC → 「索引编制 → 网页」；Bing Webmaster Tools → 「站点资源管理器 → 已编入索引」。
- **通过标准**：已编入索引的数量在涨；「已抓取但未编入索引」不超过已编入索引的 30%；
  「已发现但未编入索引」在下降。
- **重点看两类异常**：① 大批 404（说明有断链，去 DEPLOY/后台查死链列表）；
  ② 「被 noindex 排除」里出现了公开页面（说明某处的响应头配错了）。

- [ ] B2 完成

### B3 · 第 4 周：真实用户数据 + 收录抽查

- **怎么验证**
  ```
  # 手工搜（结果因地区而异，只看趋势）
  site:你的域名
  site:你的域名/tags/scene        # 标签页收录情况
  ```
  以及 GSC → 「体验 → Core Web Vitals」——**真实用户数据要累积约 28 天才出**，
  第一周看不到数据是正常的。
- **通过标准**：`site:` 的收录量和 sitemap URL 数在同一量级；
  抽查的 5 个标签页在搜索结果里的标题是「标签名 · 山海集 Atlas」这种正常格式，
  不是裸 URL 或者「无标题」。
- **之后**：把「标签页 title/description 抽查」「GSC 覆盖率」两条并进
  [`MAINTENANCE.md`](MAINTENANCE.md) 的每季度清单。

- [ ] B3 完成

---

## 三、不在这份清单里的事（别走偏）

- **不买外链、不做关键词堆砌。** 一个靠内容维护的导航站，收 20 条烂外链不如把
  30 个标签页的 `desc` 写清楚。
- **不让私密内容出现在任何公开面**：sitemap、RSS、OG 图、结构化数据里都不能有。
  发布前搜一遍：`curl -sS https://你的域名/sitemap.xml | grep -c '/me/'` 必须是 0。
- **不给同一个模板复制同一段 description。** 每个标签页写自己的 30-60 字，
  这是标签体系存在的意义之一。
- **不用 `noindex` 一刀切关掉列表页。** 列表页和标签页是吃搜索流量的主力，
  该关的只有 `/admin`、`/api`、`/me`、`/login`。
- **不为了多拿结构化数据星标去编造评分、价格、库存。** 假数据会被人工处置，
  代价远大于那点点击率。
