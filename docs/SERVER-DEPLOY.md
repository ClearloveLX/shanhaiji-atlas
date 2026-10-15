# 服务器部署方案 — 山海集 Atlas

> 基于 `D:\Vibe Coding\阿里云服务器\` 里的实测数据，不是泛泛而谈。
> 那台机器：**Ubuntu 26.04 / 2 核 / 1735 MB 内存（可用 1314 MB）/ 33 GB 可用磁盘 / 全新空机**。

---

## 一、四个结论

| 问题 | 结论 |
|---|---|
| PostgreSQL 可行吗？ | **完全可行**（150-200 MB，剩下 800+ MB）。但**没必要**，见第二节。 |
| 要装 Docker 吗？ | **不装。** 你的判断是对的。省 130 MB + 一层排障成本，代价是零。 |
| 那用什么？ | **SQLite + 原生 Node + Caddy + systemd。** |
| 在哪构建？ | **默认本地构建**，服务器构建是**正当备选**（swap 已实测扛得住），见第四节。 |

**机器现状（已确认）**：2 核 / 1735 MB 内存（可用 1314 MB）/ 33 GB 磁盘 /
**swap 2047 MB，挂 fstab，两次重启自动挂载，压测 1800 MB 分配下 swap 峰值 815 MB，无 OOM**。
所以内存这条线是**兜底住了**的 —— 剩下的都是速度和整洁度的取舍，不是生死问题。

---

## 二、为什么是 SQLite 而不是 PostgreSQL

你自己的 `数据库选型.md` 第四节列了 SQLite 的四个适用条件。逐条对一遍这个项目：

| 条件 | 这个项目 | 符合 |
|---|---|---|
| 单机部署，不需要多台服务器共享数据库 | 一台 ECS，单管理员 | ✅ |
| 写入不频繁（每秒几十次以内），读为主 | 一个人维护，偶尔有访客投稿 | ✅ |
| 数据量 < 几十 GB | 几千条条目 ≈ **几 MB** | ✅ |
| 不想管数据库运维 | 你的核心诉求 | ✅ |

四条全中 —— **按你自己的标准，这就是 SQLite 的场子。**

### 内存账（用你的真实数字：可用 1314 MB）

```
方案 A · SQLite（推荐）
  Node (Next standalone)        200-250 MB
  Caddy                           ~30 MB
  SQLite                            0 MB   ← 进程内库，不是服务
  ─────────────────────────────────────────
  合计                           230-280 MB    →  剩 1030+ MB   ✅ 非常宽裕

方案 B · PostgreSQL 18
  Node (Next standalone)        200-250 MB
  PostgreSQL 18 调优后           150-200 MB
  Caddy                           ~30 MB
  ─────────────────────────────────────────
  合计                           380-480 MB    →  剩 830+ MB    ✅ 也够

方案 C · PostgreSQL + Docker（你否掉的方案）
  dockerd + containerd              130 MB
  上面全部                        380-480 MB
  ─────────────────────────────────────────
  合计                           510-610 MB    →  剩 700+ MB    ⚠️ 白交 130 MB 税
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
2. **必须开四个 PRAGMA**（见第十节），否则默认配置下并发读写会锁库。
3. **不能多机共享。** 网络文件系统上跑 SQLite = 数据损坏。哪天要上多实例，必须换 Postgres。

> 如果你就是更喜欢 PostgreSQL（比如想用 `pg_trgm` 做中文搜索、或者以后可能迁到 RDS），
> **也完全跑得动**，方案 B 的账算过了。但我的建议是先用 SQLite，
> 把复杂度留到真正需要的时候再引入 —— 迁移成本很小，见第十三节。

---

## 三、不装 Docker 的理由

你的 `要不要装Docker.md` 已经论证过了，我补充三条针对这个项目的：

1. **dockerd 是 130 MB 的固定税**，占可用内存的 10%，而这个项目连数据库都不用额外进程了，
   再套一层容器在内存上说不通。
2. **你的服务器 `registry-1.docker.io` 直连不通**（实测 12 秒超时）。
   要用 Docker 就得配镜像加速或走 ACR，多一条依赖链。
3. **`docker build` 在这台机器上是纯粹的亏本买卖**（1.2-1.8 GB 峰值，靠 swap 能扛但极慢）。
   装了 Docker 也只能「本地构建 → 推仓库 → 服务器 pull」，绕一大圈、多 130 MB 常驻内存，
   就为了跑一个 Node 进程。

原生部署的直接好处：**出问题 `journalctl -u atlas -f` 一条命令看到底**，
不用 `docker logs` 再套一层；系统更新、日志轮转全用系统自带的。

---

## 四、构建放在哪：三种方案

你的 `要不要装Docker.md` 第五节写着：

| 构建类型 | 峰值内存 |
|---|---|
| Node 项目（npm install + build） | **1.2 ~ 1.8 GB** |

可用内存只有 1314 MB。**但你的 swap 已经实测过了**：

> 2047 MB /swapfile，挂在 fstab，两次重启自动挂载；
> 压测分配到 1800 MB 时 swap 峰值用掉 815 MB，**无 OOM**。

所以结论要修正：**在服务器上构建不会 OOM。** 但"不会挂"和"应该这么做"是两回事。

### 方案对比

| | A · 本地构建 + rsync（默认） | B · 服务器上构建 | C · CI 构建 |
|---|---|---|---|
| 部署耗时 | **~40 秒** | 5-15 分钟（swap 抖动） | ~2 分钟 |
| 部署时站点状态 | 全程正常 | **全程变慢**（应用被换出到 swap） | 全程正常 |
| 服务器要装 | 只要 Node | Node + pnpm + git + 全部 devDependencies + build-essential | 只要 Node |
| 磁盘占用 | 最小 | +400~700 MB（node_modules + pnpm store） | 最小 |
| 能否离开本机部署 | ❌ 必须在你 Windows 上 | ✅ **任何能 SSH 的地方，包括手机** | ✅ 推个 commit 就行 |
| better-sqlite3 跨平台问题 | ⚠️ 有（见第十二节） | ✅ **没有** | ✅ 没有 |
| 一次性配置成本 | 无 | 无 | 中（GitHub 仓库 + secrets） |

### 默认走 A，理由

1. **部署窗口 40 秒 vs 10 分钟。** B 方案每次发布期间，`node server.js` 的常驻内存会被
   换出到 swap，站点响应从几十毫秒变成几秒。你自己的站，你自己访问时能忍，
   但没必要每次都这样。
2. **服务器越干净越好。** A 方案服务器上只有 Node 和 Caddy 两个东西，
   出问题 `journalctl -u atlas` 一眼看到底，不需要先排除构建工具链的问题。
3. **A 方案已经有完整的命令了**（第十一节），照抄就行。

```
方案 A 的流程
┌─ 你的 Windows 机器 ────────────────────────────────┐
│  pnpm build  →  .next/standalone/                  │
│                  ├── server.js                     │
│                  ├── .next/                        │
│                  └── node_modules/（精简版）        │
└────────────────────────────────────────────────────┘
                     │  rsync over SSH（~30 秒）
                     ▼
┌─ 阿里云 ECS ───────────────────────────────────────┐
│  /opt/atlas/current → releases/20261015-1200/      │
│  node server.js          ← 只做这一件事             │
└────────────────────────────────────────────────────┘
```

### 什么时候用 B

**把 B 当成正当的备选，不是"绝对禁止"。** 以下情况直接用 B：

- 你人在外面，只有手机/平板，需要紧急改一个错别字 → SSH 上去 `git pull && pnpm build`
- A 方案的 better-sqlite3 跨平台问题折腾不通，不想再耗时间
- 你改了 Node 版本，本地和服务器的产物对不上

B 的完整命令（**在 release 目录里构建，不要在 current 里构建**）：

```bash
cd /opt/atlas/releases
RELEASE=20261015-1200
git clone --depth 1 <仓库> $RELEASE     # 或 rsync 源码过去
cd $RELEASE
pnpm install --frozen-lockfile
pnpm build
# 构建期间站点由旧版本继续提供服务，只是会慢
ln -sfn /opt/atlas/releases/$RELEASE /opt/atlas/current
systemctl restart atlas
```

**B 的注意事项**：

- 构建期间**不要**重启服务，让它跑完再换软链
- 观察 `free -m`，如果 swap 用量超过 1.5 GB 说明情况比预期糟，考虑回到 A
- 磁盘要留够：`pnpm install` 的 store + node_modules 大约 400-700 MB，
  构建产物再 +200 MB，33 GB 盘够用，但要定期 `pnpm store prune` 和清理旧 release
- 首次构建会比较慢（要下载依赖），之后有 pnpm store 缓存会快一些

### 方案 C（如果你以后想彻底解放双手）

推到 GitHub，用 Actions 构建后 rsync 到服务器。既不用占用服务器内存，
也不用依赖你的 Windows 机器在线。配置成本主要是加几个 secret：
`SSH_HOST` / `SSH_KEY` / `SSH_USER`。等你有这个需求了再说，**现在不用做**。

---

## 五、部署时怎么避免"改到一半"（release + 软链）

三种方案都建议用这个结构，**不要在 `current` 里直接构建或 rsync**：

```
/opt/atlas/
├── releases/
│   ├── 20261015-1200/     ← 当前版本
│   └── 20261015-0930/     ← 上一个版本，回滚用
├── current -> releases/20261015-1200     ← 软链，systemd 的 WorkingDirectory 指向它
└── data/                                 ← 永不动
```

好处：

1. **构建/上传期间，旧版本仍在正常服务**，不会读到写了一半的文件
2. **回滚 = 换一个软链 + 重启**，2 秒完成，不用重新构建
3. 保留最近 3 个 release，旧的删掉（每个约 100-200 MB）

systemd 里写 `WorkingDirectory=/opt/atlas/current`。
内核会把软链解析成真实路径，所以 `process.cwd()` 会是
`/opt/atlas/releases/20261015-1200`，这是正常的，不影响任何功能。

切换命令：

```bash
ln -sfn /opt/atlas/releases/20261015-1200 /opt/atlas/current
systemctl restart atlas
systemctl is-active atlas
```

回滚：

```bash
ln -sfn /opt/atlas/releases/20261015-0930 /opt/atlas/current
systemctl restart atlas
```

而且 `standalone` 模式下服务器连 `pnpm install` 都不用跑，
`node_modules` 只有运行时真正用到的那部分（通常 30-80 MB）。

---

## 六、服务器上要装什么（一次性）

```bash
# 1. Node 22（用 NodeSource 源）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 2. Caddy（自动 HTTPS，比 Nginx + certbot 省事一个数量级）
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# 3. 编译 better-sqlite3 用的工具链（见第十二节，可能用不上）
apt install -y build-essential python3

# 4. sqlite3 CLI —— 只为了备份和排查，几 MB
apt install -y sqlite3

# 5. 建用户和目录
useradd -r -s /usr/sbin/nologin -d /opt/atlas atlas
mkdir -p /opt/atlas/releases /opt/atlas/data/{uploads/{public/{icons,qrcodes,covers},private},backups}
chown -R atlas:atlas /opt/atlas
```

**不装**：PostgreSQL、Docker、docker-compose、pnpm、Nginx、redis。

---

## 七、目录结构

```
/opt/atlas/
├── current -> releases/20261015-1200/   # ★ 软链，systemd 指向它
│
├── releases/                     # 每个版本一个目录，保留最近 3 个
│   ├── 20261015-1200/            #   ← 当前版本
│   │   ├── server.js             #     standalone 入口
│   │   ├── .next/
│   │   ├── public/               #     只放构建期静态资源
│   │   └── node_modules/         #     standalone 自带的精简依赖
│   └── 20261015-0930/            #   ← 上一个版本，回滚用
│
├── data/                         # ★ 永不动，全部持久数据在这里
│   ├── atlas.db                  #    SQLite 主库
│   ├── atlas.db-wal              #    WAL 日志（必须和主库一起备份）
│   ├── atlas.db-shm
│   ├── uploads/
│   │   ├── public/               #    公开图片
│   │   │   ├── icons/
│   │   │   ├── qrcodes/
│   │   │   └── covers/
│   │   └── private/              #    ★ 私密条目的图片，走 /api/file 鉴权路由
│   │       └── {entryId}/
│   └── backups/                  #    atlas-2026-10-15.db.gz
│
├── .env                          # 权限 600，属主 atlas
└── deploy.sh                     # 部署脚本，见第十一节
```

**关键：`data/` 和 `releases/` 完全分离。** 部署 = 新增一个 release 目录 + 换软链，
`data/` 一动不动。这就是不用 Docker 也不会「重新部署丢文件」的原因。

**永远不要直接在 `current/` 里构建或 rsync。** 原因见第五节。

---

## 八、上传文件的存储与访问（重要设计调整）

之前的设计里，图标和二维码存在 `public/icons`、`public/qrcodes`。
**在这个部署方案下有严重问题：`public/` 会被每次 rsync 覆盖，上传的文件全丢。**

所以改成：

| 内容 | 存哪 | 怎么访问 |
|---|---|---|
| 公开图标 / 二维码 / 封面 | `/opt/atlas/data/uploads/public/...` | **Caddy 直接 file_server**，不经 Node |
| 私密条目的图片 | `/opt/atlas/data/uploads/private/...` | Node 路由 `/api/file/...` + `requireAdmin()` |
| favicon / og 兜底图 | `app/public/`（构建期资源） | 静态，随部署更新 |

`src/lib/storage.ts` 统一写这两个目录，返回的 URL 分别是 `/media/...` 和 `/api/file/...`。

**`/media/*` 交给 Caddy 直接读盘**，不经过 Node —— 图片不走应用进程，
省 CPU、省内存，还能用上 Caddy 的 gzip/缓存。这是原生部署比 Docker 顺手的地方。

---

## 九、systemd + Caddy 配置

### `/etc/systemd/system/atlas.service`

```ini
[Unit]
Description=ShanhaiJi Atlas
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=atlas
Group=atlas
WorkingDirectory=/opt/atlas/current
EnvironmentFile=/opt/atlas/.env
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=atlas

# 加固（systemd 自带，不花一分内存）
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/atlas/data

[Install]
WantedBy=multi-user.target
```

注意三点：

- `HOSTNAME=127.0.0.1` —— **应用只监听本地回环，不对外暴露 4000 端口**，
  外部流量一律经 Caddy。这样 4000 不需要在安全组开放，也不需要防火墙规则。
- `WorkingDirectory=/opt/atlas/current` 是软链，内核会解析成真实的 release 路径，
  所以 `process.cwd()` 会是 `/opt/atlas/releases/20261015-1200`。这是正常的，不影响功能。
- `ReadWritePaths` 里**只留 `data/`**。`releases/` 是只读的，应用不需要往里写
  （所有上传都走 `data/uploads/`）——这正好也验证了存储设计是对的。

```bash
systemctl daemon-reload
systemctl enable --now atlas
journalctl -u atlas -f          # 看日志
```

### `/etc/caddy/Caddyfile`

```caddyfile
你的域名.com {
    encode zstd gzip

    # 公开图片直接读盘，不经 Node
    handle /media/* {
        root * /opt/atlas/data/uploads/public
        file_server
        header Cache-Control "public, max-age=31536000, immutable"
    }

    # 其余全走应用
    handle {
        reverse_proxy 127.0.0.1:4000
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

Caddy 自动申请和续期 HTTPS 证书，不用配 certbot。
**记得先在阿里云安全组放行 80 和 443**（Caddy 申请证书要走 80）。

---

## 十、SQLite 的四个必开 PRAGMA

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

用 release + 软链结构（见第五节），**不要在 `current` 里直接 rsync**。

### 首次

```bash
# 服务器上
mkdir -p /opt/atlas/{releases,data/{uploads/{public/{icons,qrcodes,covers},private},backups}}
chown -R atlas:atlas /opt/atlas
# 写 .env（见下），chmod 600，属主改回 atlas
```

### 每次发布（在你的 Windows 上跑）

**核心思路：传到新目录，换软链，重启。旧版本原封不动留着，随时能回滚。**

```powershell
cd "D:\Vibe Coding\shanhaiji-atlas"

# 1. 定一个版本号
$rel = Get-Date -Format "yyyyMMdd-HHmm"

# 2. 本地构建
pnpm build

# 3. 组装产物到本地暂存目录
$stage = ".\dist-deploy"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$stage\node_modules" | Out-Null
Copy-Item ".next\standalone\*" $stage -Recurse -Force
Copy-Item ".next\static" "$stage\.next\static" -Recurse -Force
Copy-Item "public" "$stage\public" -Recurse -Force

# 4. 传到服务器上一个【新】的 release 目录（不是 current！）
ssh aliyun "mkdir -p /opt/atlas/releases/$rel"
rsync -avz --delete `
  --exclude "node_modules/better-sqlite3" `
  "$stage/" "aliyun:/opt/atlas/releases/$rel/"

# 5. 补 better-sqlite3 的 Linux 版（见第十二节）
ssh aliyun "cd /opt/atlas/releases/$rel && npm install better-sqlite3 --omit=dev --no-save"

# 6. 换软链 + 重启
ssh aliyun "ln -sfn /opt/atlas/releases/$rel /opt/atlas/current && systemctl restart atlas && sleep 2 && systemctl is-active atlas"

# 7. 清理旧版本，只留最近 3 个
ssh aliyun "cd /opt/atlas/releases && ls -1t | tail -n +4 | xargs -r rm -rf"
```

**关于 `--delete`**：它只作用于刚才新建的那个 release 目录，删的是这个目录里多余的文件。
`data/` 和 `current` 都不在它的作用范围内，**不会碰到任何持久数据**。

**回滚**（2 秒，不用重新构建）：

```bash
ssh aliyun "cd /opt/atlas/releases && ls -1t"     # 看有哪些版本
ssh aliyun "ln -sfn /opt/atlas/releases/20261015-0930 /opt/atlas/current && systemctl restart atlas"
```

### 如果你改用第五节方案 B（服务器上构建）

```bash
cd /opt/atlas/releases
RELEASE=$(date +%Y%m%d-%H%M)
git clone --depth 1 <仓库> $RELEASE
cd $RELEASE && pnpm install --frozen-lockfile && pnpm build
# 构建期间旧版本还在服务，只是会慢
ln -sfn /opt/atlas/releases/$RELEASE /opt/atlas/current
systemctl restart atlas
cd /opt/atlas/releases && ls -1t | tail -n +4 | xargs -r rm -rf
```

这个路径**没有 better-sqlite3 跨平台问题**（依赖是在服务器上装的），是 B 方案的主要优势。

### `/opt/atlas/.env`

```bash
AUTH_SECRET=（openssl rand -base64 32）
ADMIN_EMAIL=你的邮箱
ADMIN_PASSWORD=（只用于首次 seed，之后从 .env 删掉）
DATABASE_PATH=/opt/atlas/data/atlas.db
UPLOAD_DIR=/opt/atlas/data/uploads
NEXT_PUBLIC_SITE_URL=https://你的域名.com
CRON_TOKEN=（随机字符串）
AMAP_KEY=（高德 Web 服务 key）
TZ=Asia/Shanghai
```

---

## 十二、唯一的坑：`better-sqlite3` 是原生模块

`better-sqlite3` 带一个编译好的 `.node` 二进制。
**你在 Windows 上 `pnpm install` 装的是 Windows 版，直接 rsync 到 Linux 会报
`invalid ELF header` 或 `Module did not compile against this Node version`。**

三个解决方式，任选：

**方式 1（推荐）：服务器上单独装，部署脚本排除它**

```bash
# 服务器上，只需一次
cd /opt/atlas/releases/{当前版本} && npm install better-sqlite3 --omit=dev --no-save
```
`better-sqlite3` 有 linux-x64 的预编译包，通常直接下载，不用编译。
如果下载失败（国内网络），`apt install build-essential python3` 后加 `--build-from-source`。

部署时 rsync 加 `--exclude "node_modules/better-sqlite3"`，就不会被 Windows 版覆盖。

**方式 2：装一份 linux 版放旁边**

```powershell
# 本地（需要能跑 linux 容器或 WSL）
npm install better-sqlite3 --os=linux --cpu=x64 --libc=glibc
```

**方式 3：干脆用第五节的方案 B（在服务器上构建）**

在服务器上 `pnpm install` 拿到的就是 Linux 原生二进制，**这个问题直接消失**。
这是 B 方案相对于 A 方案最实在的一个优势。如果你的 A 方案卡在这一步超过半小时，
不要硬耗，切 B。

**方式 4：换纯 JS 驱动**

用 `@libsql/client`（有 WASM 模式）或评估 Node 内置的 `node:sqlite`。
好处是零原生依赖，坏处是性能略差、API 不同、生态没那么成熟。
**除非上面几种都折腾不通，否则不建议为了省一件事换驱动。**

无论用哪种，`next.config.ts` 都要加：

```ts
serverExternalPackages: ['better-sqlite3']
```

否则 Next 会试图把它打进 bundle，原生模块打不进去会报错。

---

## 十三、什么时候该换回 PostgreSQL

**触发条件（满足任意一条就该迁）：**

- 要跑**多个应用实例**（多进程 cluster、或两台机器做负载均衡）
- 出现**并发写**场景（比如开放用户注册、多人同时编辑）
- 需要**远程连接数据库**（本地用 DBeaver 连生产库）
- 数据量涨到**几十万条以上**，且需要复杂 SQL（多表 JOIN、窗口函数、全文检索）
- 要迁到**阿里云 RDS**（托管备份 + 高可用）

**迁移成本不大**：Drizzle 的 schema 从 `sqliteTable` 换成 `pgTable`，
字段类型按 `docs/PROMPTS.md` D1 的类型映射表反过来改一遍，
数据用一个脚本从 SQLite 读出写进 Postgres，半天到一天的事。
所以**现在用 SQLite 不会把路堵死**。

---

## 十四、上线检查清单

- [ ] `systemctl is-active atlas` → `active`
- [ ] `curl -I http://127.0.0.1:4000` 从服务器本机通，从外网**不通**（只监听回环）
- [ ] 域名 HTTPS 正常，证书自动签发成功
- [ ] 阿里云安全组只开放 22 / 80 / 443，**4000 不开放**
- [ ] `/media/icons/xxx.png` 能访问，且响应头是 `Cache-Control: public, max-age=31536000`
- [ ] 匿名访问 `/api/file/任意路径` → **401**
- [ ] 匿名访问私密条目的公开 URL → **404**
- [ ] 站长登录后看 `/tools`，内容和匿名看到的一模一样（缓存安全）
- [ ] `free -m` 看实际占用，应该在 300 MB 以内
- [ ] 备份脚本手动跑一次，**并且真的从备份恢复到一个测试库验证一遍**
- [ ] `journalctl -u atlas -n 50` 没有反复重启的日志
- [ ] 重启服务器后 `atlas` 和 `caddy` 自动起来（`systemctl is-enabled`）
- [ ] `/opt/atlas/current` 是软链且指向一个存在的 release 目录
- [ ] `releases/` 里只有最近 3 个版本

**最后一条最重要**：没验证过能恢复的备份等于没有备份。

---

## 十五、一句话总结

> **PostgreSQL 在这台机器上跑得动（150-200 MB），但 SQLite 更合适** —— 省一个进程、
> 一个端口、一套调优、一个备份命令，代价是你永远用不到的并发写能力。
> **Docker 不用装**（省 130 MB，包装的收益在这个项目上为零）。
> **构建默认在本地做** —— 不是因为服务器构建会 OOM（2047 MB swap 已实测扛住 1800 MB 分配），
> 而是因为服务器构建要 5-15 分钟且期间站点被换出到 swap 变慢，
> 而本地构建 + rsync 只要 40 秒。服务器构建是**正当备选**，不是禁区：
> 人在外面只有手机时、或 better-sqlite3 跨平台问题折腾不通时，直接用它。
> **部署用 release 目录 + 软链**，永远不要在 `current/` 里构建或同步。
