# 服务器部署方案 — 山海集 Atlas

> 这份文件讲**为什么这么定**（设计依据与取舍）。具体怎么做、命令怎么敲，
> 在 [`DEPLOY.md`](DEPLOY.md)。
>
> **本文档的占位符约定**：文中 `你的XXX`（如 `你的服务器IP`、`你的SSH端口`）是需要你替换成自己实际值的占位符。
> 直接复制命令前请先替换，否则命令会失败。
>
> ★ **数字与命令的唯一事实来源**是 `部署事实基准.md`（放在你自己的运维目录里，**不在本仓库**）。
> 那份文件里的每一条都是在真机上实测过的。本文与它冲突时，以它为准。
>
> 占位符的完整说明见 [`DEPLOY.md`](DEPLOY.md) 顶部。

---

## 一、四个结论

| 问题 | 结论 |
|---|---|
| PostgreSQL 可行吗？ | **完全可行**（150-200 MB，剩下 900+ MB）。但**没必要**，见第二节。 |
| 要装 Docker 吗？ | **不装。** 省 130 MB + 一层排障成本，代价是零。 |
| 那用什么？ | **SQLite + 原生 Node + Caddy + systemd。** |
| 在哪构建？ | **默认本地构建**，服务器构建是**正当备选**，见第四节。 |

**机器现状（已确认）**：2 核 / **2 GB 内存**（`free -m` 的 available 约 **1.2 GB**）/
**约 32 GB 可用磁盘** / 公网 IP `你的服务器IP` / Ubuntu 26.04.1 LTS。
**swap 2 GB，挂 fstab，重启自动挂载，压测 1800 MB 分配下 swap 峰值 815 MB，无 OOM**。
所以内存这条线是**兜底住了**的 —— 剩下的都是速度和整洁度的取舍，不是生死问题。

**SSH 不要用 22** —— 本文档示例统一写 `你的SSH端口`，按你自己的实际端口替换就行，
关键是把默认的 22 换掉（只是减少扫描噪声，挡不住针对性扫描）；
认证仅公钥（`passwordauthentication no`、`permitrootlogin prohibit-password`）。
安全组只开 **你的SSH端口 / 80 / 443**，**4000 不开**（应用只监听回环）。

---

## 二、为什么是 SQLite 而不是 PostgreSQL

`数据库选型.md` 第四节列了 SQLite 的四个适用条件。逐条对一遍这个项目：

| 条件 | 这个项目 | 符合 |
|---|---|---|
| 单机部署，不需要多台服务器共享数据库 | 一台 ECS，单管理员 | ✅ |
| 写入不频繁（每秒几十次以内），读为主 | 一个人维护，偶尔有访客投稿 | ✅ |
| 数据量 < 几十 GB | 几千条条目 ≈ **几 MB** | ✅ |
| 不想管数据库运维 | 核心诉求 | ✅ |

四条全中 —— **按自己的标准，这就是 SQLite 的场子。**

### 内存账（按可用约 1.2 GB 算）

```
方案 A · SQLite（采用）
  Node (Next standalone)        200-250 MB
  Caddy                           ~30 MB
  SQLite                            0 MB   ← 进程内库，不是服务
  ─────────────────────────────────────────
  合计                           230-280 MB    →  剩 900+ MB   ✅ 非常宽裕

方案 B · PostgreSQL 18
  Node (Next standalone)        200-250 MB
  PostgreSQL 18 调优后           150-200 MB
  Caddy                           ~30 MB
  ─────────────────────────────────────────
  合计                           380-480 MB    →  剩 700+ MB   ✅ 也够

方案 C · PostgreSQL + Docker（否掉的方案）
  dockerd + containerd              130 MB
  上面全部                        380-480 MB
  ─────────────────────────────────────────
  合计                           510-610 MB    →  剩 600+ MB   ⚠️ 白交 130 MB 税
```

### SQLite 换来的实际好处

| | PostgreSQL 18 | SQLite |
|---|---|---|
| 服务器要装的软件 | `apt install postgresql` + 改 12 个参数 | **什么都不用装**（`better-sqlite3` 自带） |
| 多一个 systemd 服务 | 要 | **不要** |
| 端口 | 5433（还要登记、还要管防火墙） | **没有端口** |
| 账号密码 | 要管、要写进 `.env` | **没有** |
| 备份 | `pg_dump \| gzip` + 定时任务 + **必须实测恢复** | `sqlite3 atlas.db ".backup x.db"` 一行 |
| 本地开发 | 先起数据库 | 直接 `pnpm dev` |
| 查询速度（小数据量） | 有 TCP 往返 + 序列化 | **更快**（进程内直接读） |

### 必须接受的三点

1. **写入是串行的。** 单个管理员 + 偶尔投稿，完全无感。但要知道这个边界。
2. **必须开五个 PRAGMA**（见第十节），否则默认配置下并发读写会锁库。
3. **不能多机共享。** 网络文件系统上跑 SQLite = 数据损坏。哪天要上多实例，必须换 Postgres。

> 如果就是更喜欢 PostgreSQL（比如想用 `pg_trgm` 做中文搜索、或者以后可能迁到 RDS），
> **也完全跑得动**，方案 B 的账算过了。但建议是先用 SQLite，
> 把复杂度留到真正需要的时候再引入 —— 迁移成本很小，见第十三节。

---

## 三、不装 Docker 的理由

`要不要装Docker.md` 已经论证过了，这里补充三条针对这个项目的：

1. **dockerd 是 130 MB 的固定税**，占可用内存的 10%，而这个项目连数据库都不用额外进程了，
   再套一层容器在内存上说不通。
2. **服务器 `registry-1.docker.io` 直连不通**（实测 12 秒超时）。
   要用 Docker 就得配镜像加速或走 ACR，多一条依赖链。
3. **`docker build` 在这台机器上是纯粹的亏本买卖**（1.2-1.8 GB 峰值，靠 swap 能扛但极慢）。
   装了 Docker 也只能「本地构建 → 推仓库 → 服务器 pull」，绕一大圈、多 130 MB 常驻内存，
   就为了跑一个 Node 进程。

原生部署的直接好处：**出问题 `journalctl -u atlas -f` 一条命令看到底**，
不用 `docker logs` 再套一层；系统更新、日志轮转全用系统自带的。

> **Nginx 同样不装**（已 purge，0 包残留）。选 Caddy 的理由就是一条：
> 一条 `handle` 就能反代，证书自动申请续期，不需要 certbot、不需要写续期任务。

---

## 四、构建放在哪：三种方案

`要不要装Docker.md` 第五节写着：

| 构建类型 | 峰值内存 |
|---|---|
| Node 项目（npm install + build） | **1.2 ~ 1.8 GB** |

可用内存只有 1.2 GB。**但 swap 已经实测过了**：

> 2 GB /swapfile，挂在 fstab，重启自动挂载；
> 压测分配到 1800 MB 时 swap 峰值用掉 815 MB，**无 OOM**。

所以结论要修正：**在服务器上构建不会 OOM。** 但"不会挂"和"应该这么做"是两回事。

### 方案对比

| | A · 本地构建 + tar/SFTP（默认） | B · 服务器上构建 | C · CI 构建 |
|---|---|---|---|
| 部署耗时 | **~40 秒** | 5-15 分钟（swap 抖动） | ~2 分钟 |
| 部署时站点状态 | 全程正常 | **全程变慢**（应用被换出到 swap） | 全程正常 |
| 服务器要装 | 只要 Node + Caddy | Node + Caddy + pnpm + git + 全部 devDependencies + build-essential | 只要 Node + Caddy |
| 磁盘占用 | 最小 | +400~700 MB（node_modules + pnpm store） | 最小 |
| 能否离开本机部署 | ❌ 必须在你 Windows 上 | ✅ **任何能 SSH 的地方，包括手机** | ✅ 推个 commit 就行 |
| 一次性配置成本 | 无 | 无 | 中（GitHub 仓库 + secrets） |

> **`sharp` 的跨平台问题两种方案都有**（见第十二节），因为它靠 `pnpm-workspace.yaml`
> 的 `supportedArchitectures` 解决，跟在哪构建无关。

### 默认走 A，理由

1. **部署窗口 40 秒 vs 10 分钟。** B 方案每次发布期间，`node server.js` 的常驻内存会被
   换出到 swap，站点响应从几十毫秒变成几秒。
2. **服务器越干净越好。** A 方案服务器上只有 Node 和 Caddy 两个东西，
   出问题 `journalctl -u atlas` 一眼看到底，不需要先排除构建工具链的问题。
3. **A 方案已经有现成工具**（`deploy.py`，见 `DEPLOY.md` 第七节），照跑就行。

```
方案 A 的流程
┌─ 你的 Windows 机器 ────────────────────────────────┐
│  pnpm build  →  .next/standalone/                  │
│  组装 dist-deploy/（删 data/、补 scripts/+drizzle/）│
│  tar.gz                                            │
└────────────────────────────────────────────────────┘
        │  SFTP（paramiko，~30 秒）    ← 本机没有 rsync
        ▼
┌─ 阿里云 ECS ───────────────────────────────────────┐
│  /opt/atlas/releases/版本号/                        │
│  .next/cache -> /opt/atlas/data/cache               │
│  current -> releases/版本号                         │
│  node server.js          ← 只做这一件事             │
└────────────────────────────────────────────────────┘
```

### 什么时候用 B

**把 B 当成正当的备选，不是"绝对禁止"。** 以下情况直接用 B：

- 你人在外面，只有手机/平板，需要紧急改一个错别字
- 本机环境出问题（pnpm 装不上、构建报奇怪的错），而线上等着修

B 的完整命令（**在 release 目录里构建，不要在 current 里构建**）：

```bash
cd /opt/atlas/releases
RELEASE=20261016-1600
git clone --depth 1 https://github.com/ClearloveLX/shanhaiji-atlas.git $RELEASE
cd $RELEASE
pnpm install --frozen-lockfile
pnpm build
# 构建期间站点由旧版本继续提供服务，只是会慢

# ★ 别忘了 .next/cache 软链 —— systemd 是 ProtectSystem=strict，release 只读
rm -rf .next/cache && ln -s /opt/atlas/data/cache .next/cache

ln -sfn /opt/atlas/releases/$RELEASE /opt/atlas/current
systemctl restart atlas
```

**B 的注意事项**：

- 构建期间**不要**重启服务，让它跑完再换软链
- 观察 `free -m`，如果 swap 用量超过 1.5 GB 说明情况比预期糟，考虑回到 A
- 磁盘要留够：`pnpm install` 的 store + node_modules 大约 400-700 MB，
  构建产物再 +200 MB，32 GB 可用空间够用，但要定期 `pnpm store prune` 和清理旧 release
- 首次构建会比较慢（要下载依赖），之后有 pnpm store 缓存会快一些

### 方案 C（如果以后想彻底解放双手）

推到 GitHub，用 Actions 构建后同步到服务器。既不用占用服务器内存，
也不用依赖你的 Windows 机器在线。配置成本主要是加几个 secret：
`SSH_HOST` / `SSH_PORT`（**你改过的那个非 22 端口**）/ `SSH_KEY` / `SSH_USER`。
等有这个需求了再说，**现在不用做**。

---

## 五、部署时怎么避免"改到一半"（release + 软链）

三种方案都建议用这个结构，**不要在 `current` 里直接构建或解包**：

```
/opt/atlas/
├── releases/
│   ├── 20261016-1600/     ← 当前版本
│   └── 20261016-1500/     ← 上一个版本，回滚用
├── current -> releases/20261016-1600     ← 软链，systemd 的 WorkingDirectory 指向它
└── data/                                 ← 永不动
```

好处：

1. **构建/上传期间，旧版本仍在正常服务**，不会读到写了一半的文件
2. **回滚 = 换一个软链 + 重启**，2 秒完成，不用重新构建
3. 保留最近 3 个 release，旧的删掉（每个约 100-200 MB）

systemd 里写 `WorkingDirectory=/opt/atlas/current`。
内核会把软链解析成真实路径，所以 `process.cwd()` 会是
`/opt/atlas/releases/20261016-1600`，这是正常的，不影响任何功能。

切换命令：

```bash
ln -sfn /opt/atlas/releases/20261016-1600 /opt/atlas/current
systemctl restart atlas
systemctl is-active atlas
```

回滚：

```bash
ln -sfn /opt/atlas/releases/20261016-1500 /opt/atlas/current
systemctl restart atlas
```

而且 `standalone` 模式下服务器连 `pnpm install` 都不用跑，
`node_modules` 只有运行时真正用到的那部分（通常 30-80 MB）。

### ★ release 里必须有 `.next/cache` 软链

这是 `ProtectSystem=strict` + `ReadWritePaths=/opt/atlas/data` 的**配套要求**，不是可选项。

`ProtectSystem=strict` 把整个文件系统挂成只读（`/opt/atlas/data` 除外），
而 Next 默认要往 `<release>/.next/cache` 写两样东西：

| 写入内容 | 写不进去的后果 |
|---|---|
| `next/image` 的优化结果 | **图片优化接口 500** —— 前台卡片和后台表格都用 `next/image`，表现是图标全裂 |
| `unstable_cache` 的增量缓存 | **`src/db/queries.ts` 里所有读查询的缓存全部失效**，整站变慢 |

所以每个 release 都要做（`deploy.py` 自动做，方案 B 手工做）：

```bash
rm -rf "$REL/.next/cache"
ln -s /opt/atlas/data/cache "$REL/.next/cache"
```

---

## 六、服务器上要装什么（一次性，已装完）

```bash
# 1. Node 22（用 NodeSource 源）→ 实际 v22.23.3，自带 npm 10.9.9
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 2. Caddy —— ★ 用 Ubuntu 官方源，版本 2.6.2
apt install -y caddy
caddy version

# 3. sqlite3 CLI —— 只为了备份和排查，几 MB
apt install -y sqlite3

# 4. 编译工具链 —— 目前用不上，留着以防万一
apt install -y build-essential python3

# 5. 建用户和目录
useradd -r -s /usr/sbin/nologin -d /opt/atlas atlas
mkdir -p /opt/atlas/{releases,scripts}
mkdir -p /opt/atlas/data/{uploads/public/{icons,qrcodes,covers},uploads/private,backups,cache}
chown -R atlas:atlas /opt/atlas

# 6. caddy 要能读公开图片目录
usermod -aG atlas caddy
```

**不装**：PostgreSQL、Docker、docker-compose、pnpm、Nginx（已 purge）、redis。

> **Caddy 不要加 cloudsmith 第三方源。** 早期文档里那段
> `dl.cloudsmith.io/.../gpg.key` + `debian.deb.txt` 的写法已经不用了 ——
> Ubuntu 官方源就有 caddy，版本 2.6.2，跟系统一起 `apt upgrade` 即可，
> 少维护一个第三方源和它的 key。

### Node 版本：服务器和本地**不需要**一致

本地是 **Node v24.18.0**，服务器是 **v22.23.3**，不一致完全没问题。

`better-sqlite3` v13 用的是 **N-API 预编译包**：npm 包里直接带八个平台的
`prebuilds/*.node`，`lib/binding.js` 按平台/架构挑一个加载，**不绑 Node ABI**。
所以既没有 `NODE_MODULE_VERSION mismatch`，也不需要"两边一起升"。
细节见第十二节。

---

## 七、目录结构

**全机只有这一个部署布局**（没有 `/opt/apps`，没有 `/var/www/html` —— 那些是
服务器准备阶段的临时落脚点，已废弃）。

```
/opt/atlas/
├── current -> releases/20261016-1600/   # ★ 软链，systemd 指向它
│
├── releases/                     # 每个版本一个目录，保留最近 3 个
│   ├── 20261016-1600/            #   ← 当前版本
│   │   ├── server.js             #     standalone 入口
│   │   ├── .next/
│   │   │   ├── static/           #     Next 不打进 standalone，要手工放
│   │   │   └── cache -> /opt/atlas/data/cache   # ★ 软链，见第五节
│   │   ├── public/               #     只放构建期静态资源（当前是空的）
│   │   ├── scripts/              #     ★ standalone 里没有，必须显式拷
│   │   ├── drizzle/              #     迁移 SQL，带了才能跑迁移
│   │   └── node_modules/         #     standalone 自带的精简依赖
│   └── 20261016-1500/            #   ← 上一个版本，回滚用
│
├── scripts/                      # ★ release 外面的稳定路径，cron 引用它
│   ├── backup.sh
│   └── restore.sh
│
├── data/                         # ★ 永不动，全部持久数据在这里
│   ├── atlas.db                  #    SQLite 主库
│   ├── atlas.db-wal              #    WAL 日志（必须和主库一起备份）
│   ├── atlas.db-shm
│   ├── cache/                    #    ★ Next 的 .next/cache 软链到这里
│   ├── uploads/
│   │   ├── public/               #    公开图片
│   │   │   ├── icons/
│   │   │   ├── qrcodes/
│   │   │   └── covers/
│   │   └── private/              #    ★ 私密条目的图片，走 /api/file 鉴权路由
│   │       └── {entryId}/
│   └── backups/                  #    atlas-2026-10-16.db.gz
│
└── .env                          # 权限 600，属主 atlas
```

**关键：`data/` 和 `releases/` 完全分离。** 部署 = 新增一个 release 目录 + 换软链，
`data/` 一动不动。这就是不用 Docker 也不会「重新部署丢文件」的原因。

**永远不要直接在 `current/` 里构建或解包。** 原因见第五节。

> 服务器上**不放发布脚本**。发布逻辑全在本地运维工作区的 `deploy.py` ——
> 它上传 tar 后在服务器 `/tmp` 临时落一个脚本执行，跑完即弃，不留在 `/opt/atlas` 下。
> 手工发布步骤见 `DEPLOY.md` 第七节。

---

## 八、上传文件的存储与访问

**不能把上传文件放进 `public/`。** 每次发布都是一个**全新的 release 目录**，
`public/` 里只会有构建期资源，放里面的上传文件全丢。

所以：

| 内容 | 存哪 | 怎么访问 |
|---|---|---|
| 公开图标 / 二维码 / 封面 | `/opt/atlas/data/uploads/public/...` | **Caddy 直接 file_server**，不经 Node |
| 私密条目的图片 | `/opt/atlas/data/uploads/private/...` | Node 路由 `/api/file/...` + `requireAdmin()` |
| favicon / og 图 | 构建期路由（`src/app/favicon.ico`、`src/app/og/route.tsx`） | 随部署更新，不在 `public/` |
| 自定义 favicon（后台可传） | `/opt/atlas/data/uploads/public/...` | 同上，走 `/media/...` |

`src/lib/storage.ts` 统一写这两个目录，返回的 URL 分别是 `/media/...` 和 `/api/file/...`。

**`/media/*` 交给 Caddy 直接读盘**，不经过 Node —— 图片不走应用进程，
省 CPU、省内存，还能用上 Caddy 的 gzip/缓存。这是原生部署比 Docker 顺手的地方。

> 另外留了一个抽象层：以后要迁阿里云 OSS 或 Cloudflare R2，只改 `storage.ts` 一个文件。
> **现在先不上对象存储** —— 图标 + 二维码 + 封面加起来通常不到 500 MB，本地卷足够。

---

## 九、systemd + Caddy 配置

### `/etc/systemd/system/atlas.service`

```ini
[Unit]
Description=ShanhaiJi Atlas (Next.js standalone)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=atlas
Group=atlas
WorkingDirectory=/opt/atlas/current
EnvironmentFile=/opt/atlas/.env
Environment=NODE_ENV=production
# 只监听回环：4000 不对公网暴露，外部流量一律经 Caddy。
# 所以阿里云安全组不需要放行 4000，ufw 也不需要加规则。
Environment=PORT=4000
Environment=HOSTNAME=127.0.0.1
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=atlas

# ── 加固（systemd 自带，不花一分内存）──
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
ReadWritePaths=/opt/atlas/data

[Install]
WantedBy=multi-user.target
```

注意四点：

- `HOSTNAME=127.0.0.1` —— **应用只监听本地回环，不对外暴露 4000 端口**，
  外部流量一律经 Caddy。这样 4000 不需要在安全组开放，也不需要防火墙规则。
- `WorkingDirectory=/opt/atlas/current` 是软链，内核会解析成真实的 release 路径，
  所以 `process.cwd()` 会是 `/opt/atlas/releases/20261016-1600`。这是正常的，不影响功能。
- `ReadWritePaths` 里**只留 `data/`**。`releases/` 是只读的，应用不需要往里写
  （所有上传都走 `data/uploads/`）——这正好也验证了存储设计是对的。
  **配套要求见第五节**：`.next/cache` 必须软链到 `/opt/atlas/data/cache`，
  否则 Next 无处可写，图片优化 500 + `unstable_cache` 全失效。
- `NEXT_TELEMETRY_DISABLED=1` —— 不发遥测。

```bash
systemctl daemon-reload
systemctl enable atlas            # 只置开机自启，先别 start —— current 要等首次发布才有
journalctl -u atlas -f            # 看日志
```

### `/etc/caddy/Caddyfile`

站点地址现在是 **`:80`**（还没有域名）。

```caddyfile
# ★★★ 换域名只改下面这一行 ★★★
#
#     :80                 → 现在这样（只有 IP，纯 HTTP）
#     atlas.example.com   → 有域名之后（Caddy 自动申请 + 自动续期 HTTPS 证书，
#                           同时把 80 上的请求 308 跳到 443，不用配 certbot）
#
#   前提：阿里云安全组要放行 80 和 443；域名 A 记录要指向本机 IP。
#
:80 {

	encode zstd gzip

	# ─────────────────────────────────────────────────────────────
	#  ⚠️⚠️ 这一段的安全头是「生产环境唯一生效的一道 SVG 兜底」。
	#
	#  src/app/media/[...path]/route.ts 里对 .svg 也加了同样的 CSP，
	#  但那个路由在生产环境【根本不会执行】—— 就是被这个 handle 抢先接管了。
	#  只在路由里写 = 生产环境实际少一层防护。
	#  两处的头必须保持一致，改一处要同步改另一处。
	# ─────────────────────────────────────────────────────────────
	handle /media/* {
		root * /opt/atlas/data/uploads/public

		header {
			Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; sandbox"
			X-Content-Type-Options nosniff
			Cache-Control "public, max-age=31536000, immutable"
		}

		# SVG 额外一层：不给「当文档直接打开」的机会。
		# 作为 <img> 子资源加载时浏览器会忽略 Content-Disposition，站内图标不受影响。
		@svg path *.svg
		header @svg Content-Disposition "attachment"

		file_server
	}

	# 边缘存活探针（只证明 Caddy 活着，不证明 Node 应用活着）
	handle /health {
		respond "OK" 200
	}

	# 其余全部交给 Node 应用
	handle {
		reverse_proxy 127.0.0.1:4000
	}

	handle_errors {
		@err5xx expression {err.status_code} >= 500
		handle @err5xx {
			respond "服务暂时不可用（HTTP {err.status_code}）。若刚重启过服务器，请等 5 秒刷新；持续这样请看 journalctl -u atlas -n 50" 503
		}
	}

	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}

	log {
		output file /var/log/caddy/atlas.log {
			roll_size 10mb
			roll_keep 5
		}
	}
}
```

Caddy 是 **2.6.2**（Ubuntu 官方源）。两个版本相关的坑：

- `http.matchers.status` 是 **Caddy 2.7** 才加的模块。本机是 2.6.2，
  所以 `@err5xx status 500` 会直接 validate 失败
  （`module not registered: http.matchers.status`），必须用 `expression {err.status_code} >= 500`。
- 改完配置用 `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`，
  **不要 restart**（reload 不断连接）。

**有域名之后**：改第一行的 `:80` → `你的域名`，Caddy 自动申请并续期 HTTPS 证书，
不用配 certbot，也不用写续期任务。前置条件是**阿里云安全组放行 80 和 443**，
且域名 A 记录指向 `你的服务器IP`，否则 Caddy 会一直重试。
改完还要在本地用 `python deploy.py --site-url https://你的域名` **重新构建一次**
（`NEXT_PUBLIC_SITE_URL` 是构建期内联的）。

---

## 十、SQLite 的五个必开 PRAGMA

`src/db/index.ts` 里建连接后立刻执行，**一个都不能少**：

```ts
const sqlite = new Database('/opt/atlas/data/atlas.db')

sqlite.pragma('journal_mode = WAL')     // 允许读写并发；默认的 rollback 模式会锁整库
sqlite.pragma('busy_timeout = 5000')    // 写冲突时等 5 秒而不是直接抛 SQLITE_BUSY
sqlite.pragma('synchronous = NORMAL')   // WAL 模式下安全，且比 FULL 快很多
sqlite.pragma('foreign_keys = ON')      // 默认居然是关的，外键约束不生效
sqlite.pragma('cache_size = -16000')    // 16 MB 页缓存（负数表示 KB）
```

数据库路径从 `DATABASE_PATH` 环境变量读，本地开发默认 `./data/atlas.db`。

**备份必须用 `.backup` 命令，不能 `cp`。** WAL 模式下主库文件单独复制出来是不一致的：

```bash
# ✅ 正确
sqlite3 /opt/atlas/data/atlas.db ".backup '/opt/atlas/data/backups/atlas-$(date +%F).db'"

# ❌ 错误（WAL 里的已提交数据不在主库文件里，拷出来可能是旧的甚至损坏的）
cp /opt/atlas/data/atlas.db /opt/atlas/data/backups/
```

或者用 `VACUUM INTO '/path/x.db'`，效果一样，还会顺便整理碎片。

---

## 十一、部署流程

用 release + 软链结构（见第五节），**不要在 `current` 里直接解包**。

**传输方式是 tar + SFTP，不是 rsync** —— 本机（Windows）没有 rsync，
旧文档里的 `rsync -avz` 在这台机器上跑不了。完整命令见 `DEPLOY.md` 第七节，
一键版是本地运维工作区的 `python deploy.py`。

### 首次

```bash
# 服务器上
mkdir -p /opt/atlas/{releases,scripts}
mkdir -p /opt/atlas/data/{uploads/public/{icons,qrcodes,covers},uploads/private,backups,cache}
chown -R atlas:atlas /opt/atlas

# 写 .env（见下），chmod 600，属主改回 atlas
# 装 systemd 单元和 Caddyfile，systemctl daemon-reload && systemctl enable atlas
# systemctl reload caddy
```

### 每次发布（在你的 Windows 上跑）

```powershell
cd 你的运维目录
python deploy.py                      # 全流程：构建→组装→tar→SFTP→解包→软链→重启→烟测→清理
python deploy.py --rollback 版本号    # 换成你要回滚到的那个版本号
python deploy.py --list               # 看 releases / current / 服务状态
```

`deploy.py` 在服务器上做的事（按顺序）：

1. 解开产物到 `/opt/atlas/releases/版本号/`（目标目录已存在就报错退出，不会覆盖）
2. **`rm -rf .next/cache && ln -s /opt/atlas/data/cache .next/cache`** ← 见第五节
3. `chown -R atlas:atlas`
4. 换 `current` 软链 + `systemctl restart atlas`
5. 烟测（本机 4000 / 经 Caddy 80 / sitemap.xml）
6. 清理旧 release，保留最近 3 个
7. 打印回滚命令

**回滚**（2 秒，不用重新构建）：

```bash
python deploy.py --list                       # 看有哪些版本
python deploy.py --rollback 版本号
```

### 三件容易漏的事

| 漏了 | 后果 |
|---|---|
| 从产物里**删掉 `data/`** | `next build` 会因 `src/lib/storage.ts` 的 `path.resolve(process.cwd(), './data/uploads')` 被文件追踪命中，把本地 `data/uploads` 整棵打进 standalone —— 陈旧上传混进 release，违反"releases 里什么都不能存" |
| **补上 `scripts/`** | standalone 只含应用真正 import 到的模块。不拷的话 `/opt/atlas/current/scripts/backup.sh` 永远不存在，cron 指向空路径，**备份静默地从来没跑过** |
| **补上 `drizzle/`** | 服务器上跑 `node scripts/migrate.mjs` 要读 `drizzle/*.sql`，不拷就直接报找不到迁移文件 |

三件事 `deploy.py` 都会自动做并打印结果。手工发布时按 `DEPLOY.md` 7.2 的清单来。

### `/opt/atlas/.env`

```bash
DATABASE_PATH=/opt/atlas/data/atlas.db
UPLOAD_DIR=/opt/atlas/data/uploads
AUTH_SECRET=（openssl rand -base64 32）
NEXT_PUBLIC_SITE_URL=http://你的服务器IP      # 有域名后改成 https://你的域名 并重新构建
CRON_TOKEN=（openssl rand -hex 24）
TZ=Asia/Shanghai

# AMAP_KEY              = Web 服务 key（后台地理编码用）
# NEXT_PUBLIC_AMAP_JS_KEY = Web 端 JS API key（好店地图页画底图）
#
# ★ ADMIN_EMAIL / ADMIN_PASSWORD 在这里【不起作用】——
#   管理员账号存在 settings 表 key='admin'（{"email","passwordHash"}），
#   本来由本地 pnpm db:seed 写入，但服务器上没有 pnpm/tsx，跑不了 seed。
#   正确做法：本地算 bcrypt hash → 服务器上 sqlite3 UPDATE（见 DEPLOY.md 6.3）
#
# ⚠️ NEXT_PUBLIC_* 是【构建期内联】的：写在这里对已构建好的客户端包无效，
#    必须在本地 pnpm build 之前配到 .env.local 或构建环境里。
```

---

## 十二、跨平台依赖（一个作废，一个真实存在）

### 12.1 `better-sqlite3` —— 这个问题**已经不存在了**

**这一节以前写的是"唯一的坑"，那个结论作废了。**

`better-sqlite3` **v13 已改用 N-API 预编译包**：

- npm 包里直接带 `prebuilds/{linux,linuxmusl,darwin,win32}-{x64,arm64}.node` **八个平台的二进制**
- `lib/binding.js` 按 `process.platform` / `process.arch` 自动挑一个加载
- **没有 `build/Release/` 目录**，也不需要按 Node ABI 现场编译

实测（服务器上 `npm install better-sqlite3@13`）：8 个 prebuilds 全部就位，
`build/Release` 不存在，`:memory:` 建表插入查询全部正常，`sqlite_version()` = 3.53.4。

**推论 —— 下面这些说法全部作废：**

| 作废的说法 | 为什么 |
|---|---|
| ❌「Windows 装的二进制拷到 Linux 会报 `invalid ELF header`」 | v13 包里带着 linux-x64 的 `.node`，不存在"拿错平台"这回事 |
| ❌「`--exclude node_modules/better-sqlite3` 再在服务器上 `npm install`」 | 不需要，standalone 里已经是完整可用的 |
| ❌「服务器 Node 主版本必须和本地一致，否则 `NODE_MODULE_VERSION mismatch`」 | N-API 不绑 ABI；本地 v24 + 服务器 v22 完全没问题 |
| ❌「跨平台问题折腾不通就改用方案 B」 | 这个理由消失了 |
| ❌「`allowBuilds.better-sqlite3: false` 的理由是它自带 `build/Release/better_sqlite3.node`」 | 结论对（确实不用跑安装脚本），**理由错** —— 是 `prebuilds/*.node`，不是 `build/Release/` |

唯一保留的一条：`next.config.ts` 里必须有

```ts
serverExternalPackages: ['better-sqlite3']
```

否则 Next 会试图把它打进 bundle，原生模块打不进去会报错。（已经有了。）

### 12.2 `sharp` —— **这个才是真实存在的跨平台问题**

`next/image` 用在 4 个组件：`EntryCard.tsx`、`EntryDetail.tsx`、`EntryTable.tsx`、`MeEntryList.tsx`。

**症状**：Windows 上构建、部署到 Linux 后，**全站图标全裂**。

**原因**：

- Next 15 的图片优化器内部 `require('sharp')`
  （`node_modules/next/dist/server/image-optimizer.js:208`）
- sharp 的真正二进制是 optionalDependencies 里的
  `@img/sharp-平台-架构` 这一类平台专用包（Linux x64 那两份就是
  `@img/sharp-linux-x64` + `@img/sharp-libvips-linux-x64`）
- pnpm **默认只装当前平台**那一份 → Windows 构建只带 `sharp-win32-x64`，
  拷到 Linux 后 `require('sharp')` 找不到 linux-x64

**修法（已落地在 `pnpm-workspace.yaml`）**：

```yaml
supportedArchitectures:
  os: [win32, linux]
  cpu: [x64]
  libc: [glibc]
```

**实测生效**：`@img/sharp-linux-x64` + `@img/sharp-libvips-linux-x64` 已装，
且 Next 的 tracing 已把它们带进 `.next/standalone/node_modules/@img/`
（415 KB 的 `sharp-linux-x64-0.35.5.node`）。

**这条和构建位置无关** —— 方案 A 和方案 B 都要靠它（方案 B 在 Linux 上装依赖时
只会装到 linux-x64，反而没这个问题；但为了本地产物可用，这几行必须留着）。

---

## 十三、什么时候该换回 PostgreSQL

**触发条件（满足任意一条就该迁）：**

- 要跑**多个应用实例**（多进程 cluster、或两台机器做负载均衡）
- 出现**并发写**场景（比如开放用户注册、多人同时编辑）
- 需要**远程连接数据库**（本地用 DBeaver 连生产库）
- 数据量涨到**几十万条以上**，且需要复杂 SQL（多表 JOIN、窗口函数、全文检索）
- 要迁到**阿里云 RDS**（托管备份 + 高可用）

**迁移成本不大**：Drizzle 的 schema 从 `sqliteTable` 换成 `pgTable`，
字段类型按 [`DATA-MODEL.md`](DATA-MODEL.md) 第 2.0 节的类型映射表反过来改一遍，
数据用一个脚本从 SQLite 读出写进 Postgres，半天到一天的事。
所以**现在用 SQLite 不会把路堵死**。

---

## 十四、上线检查清单

- [ ] `systemctl is-active atlas` → `active`；`systemctl is-active caddy` → `active`
- [ ] `curl -I http://127.0.0.1:4000` 从服务器本机通，从外网**不通**（只监听回环）
- [ ] 阿里云安全组只开放 **你的SSH端口 / 80 / 443**，**4000 不开放**
- [ ] `http://你的服务器IP/` 能打开（有域名后改为验证 HTTPS 与证书自动签发）
- [ ] `/media/icons/xxx.png` 能访问，且响应头是 `Cache-Control: public, max-age=31536000, immutable`
- [ ] `/media/xxx.svg` 的响应头里有 `Content-Security-Policy` 和 `Content-Disposition: attachment`
- [ ] `ls -ld /opt/atlas/current/.next/cache` → 指向 `/opt/atlas/data/cache`
- [ ] 匿名访问 `/api/file/任意路径` → **401**
- [ ] 匿名访问私密条目的公开 URL → **404**
- [ ] 站长登录后看 `/tools`，内容和匿名看到的一模一样（缓存安全）
- [ ] `free -m` 看实际占用，应该在 300 MB 以内
- [ ] 备份脚本手动跑一次，**并且真的从备份恢复到一个测试库验证一遍**
- [ ] crontab 里有 `backup.sh` 和 `/api/cron/qrcodes` 两行
- [ ] `journalctl -u atlas -n 50` 没有反复重启的日志
- [ ] 重启服务器后 `atlas` 和 `caddy` 自动起来（`systemctl is-enabled`）
- [ ] `/opt/atlas/current` 是软链且指向一个存在的 release 目录
- [ ] `releases/` 里只有最近 3 个版本

**最后一条最重要**：没验证过能恢复的备份等于没有备份。

---

## 十五、一句话总结

> **PostgreSQL 在这台机器上跑得动（150-200 MB），但 SQLite 更合适** —— 省一个进程、
> 一个端口、一套调优、一个备份命令，代价是你永远用不到的并发写能力。
> **Docker 不用装**（省 130 MB，包装的收益在这个项目上为零）；**Nginx 也不用**（已 purge，用 Caddy）。
> **构建默认在本地做** —— 不是因为服务器构建会 OOM（2 GB swap 已实测扛住 1800 MB 分配），
> 而是因为服务器构建要 5-15 分钟且期间站点被换出到 swap 变慢，而本地构建只要 40 秒。
> 服务器构建是**正当备选**，不是禁区。
> **传输用 tar + SFTP**（本机没有 rsync），一键工具是运维工作区的 `deploy.py`。
> **部署用 release 目录 + 软链**，永远不要在 `current/` 里构建或同步；
> 每个 release 都别忘了 `.next/cache` 软链 —— 那是 `ProtectSystem=strict` 的配套要求。
