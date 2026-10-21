# 部署手册 — 山海集 Atlas

> 面向「一年后回来看这份文件的自己」。所有命令都可以直接复制执行，不是示意。
> 这份文件只讲**怎么做**，以及**做错了会怎样**；为什么这么定，写在相应小节里。
>
> **本文档的占位符约定**：文中 `你的XXX`（如 `你的服务器IP`、`你的SSH端口`）是需要你替换成自己实际值的占位符。
> 直接复制命令前请先替换，否则命令会失败。
>
> ★ **数字与命令的唯一事实来源**是 `部署事实基准.md`（放在你自己的运维目录里，**不在本仓库**）。
> 那份文件里的每一条都是在真机上实测过的。本文与它冲突时，以它为准。
>
> 会用到的占位符一览：
>
> | 占位符 | 填什么 |
> |---|---|
> | `你的服务器IP` | 云服务器的公网 IP |
> | `你的SSH端口` | 你自己改过的 SSH 端口 —— **关键是要改掉默认的 22**，改成什么由你定 |
> | `你的项目目录` | 本仓库在你机器上的路径 |
> | `你的运维目录` | 放 `deploy.py` 的目录，**放哪都行**，文档里只是一个建议位置 |
> | `版本号` | release 目录名，形如 `20261016-1600`（`python deploy.py --list` 能看到现有的） |

**六个结论先摆在这里：**

| 问题 | 结论 |
|---|---|
| 用 Docker 吗？ | **不用。** 见第二节。 |
| 用 PostgreSQL 吗？ | **不用。** 数据库就是一个文件 `/opt/atlas/data/atlas.db`。 |
| 在哪构建？ | **默认本地构建 → tar 打包 → SFTP 上传**。本机没有 rsync，别照着旧文档写 `rsync -avz`。 |
| 部署怎么不中断？ | releases 目录 + `current` 软链。**永远不在 `current/` 里构建或上传。** |
| 回滚要多久？ | 换一条软链 + `systemctl restart atlas`，2 秒。 |
| 数据在哪？ | 全部在 `/opt/atlas/data/`，部署永远不碰它。 |

**一键发布**（本地，一条命令）：

```powershell
cd 你的运维目录
python deploy.py                 # 构建 → 组装 → tar → SFTP → 服务器解包 → 软链 → 重启 → 烟测
```

> `deploy.py` 在**你的运维目录**里（和本项目仓库分开，放哪都行），不在本项目仓库里。
> 它复用了同目录的 `remote.py`（paramiko 连接封装）。
> 下面第七节会把这条命令拆开讲清楚每一步在干什么 —— 脚本出问题时你需要能手工做一遍。

---

## 一、机器现状（先记住这几个数字）

| 项 | 值 |
|---|---|
| 服务器 | 一台入门级云服务器，单机部署（无托管数据库、无负载均衡） |
| 公网 IP | `你的服务器IP` |
| 系统 | Ubuntu 26.04.1 LTS (Resolute Raccoon)，内核 7.0.0-31-generic |
| CPU | **2 核** |
| 内存 | **2 GB**，`free -m` 的 available 约 **1.2 GB** |
| 磁盘 | **40 GB**，约 **32 GB 可用** |
| swap | **2 GB**，挂在 `/etc/fstab`，重启自动挂载 |
| 实测结论 | 压测分配到 **1800 MB** 时 swap 峰值用掉 **815 MB**，**没有 OOM** |

**最后一行是「服务器上构建不会挂」的依据**，别把它删了 —— 一年后你可能会怀疑
「2 核 2 G 也敢跑 `next build`？」，答案是会慢、会被换出到 swap，但不会 OOM。
（不过**默认还是在本地构建**：服务器上构建要 5–15 分钟，期间站点被换出到 swap 变慢；
本地构建 + 打包传输只要 40 秒。）

### SSH 不要用 22

把 SSH 改成非标准端口能挡掉绝大部分自动化扫描
（注意：**只是减少噪声，挡不住针对性扫描** —— 所以公钥认证和 fail2ban 不能省）。
本文档里的 `你的SSH端口` 是占位符，换成你自己的。

**先在 `~/.ssh/config` 里配一个别名**，之后 `ssh aliyun` 一条命令就能连，
不用每次敲端口和私钥路径：

```
Host aliyun
    HostName 你的服务器IP
    Port 你的SSH端口
    User root
    IdentityFile ~/.ssh/id_ed25519
```

配好之后：

```bash
ssh aliyun                              # ✅ 配好别名后最省事
ssh -p 你的SSH端口 -i ~/.ssh/id_ed25519 root@你的服务器IP   # ✅ 手写也行
ssh root@你的服务器IP                     # ❌ 一定失败：22 已关闭，密码登录也已关闭
```

- 22 端口**已彻底关闭**（外部端口扫描确认），只开 **你的SSH端口 / 80 / 443**。
- 认证**仅公钥**：`passwordauthentication no`、`permitrootlogin prohibit-password`、`maxauthtries 3`。
- fail2ban 盯着 SSH 端口：连续失败若干次就封 IP，再犯时长逐次翻倍。
- 私钥丢了只能走**阿里云控制台 VNC**。私钥记得备份。

### 内存账（按实际可用 1.2 GB 算）

```
Node（Next standalone）   200-250 MB
Caddy                      ~30 MB
SQLite                       0 MB   ← 进程内库，不是服务，没有端口没有账号
─────────────────────────────────────
合计                      230-280 MB   →  剩 900+ MB
```

日常状态应该是 `free -m` 里 used 不到 300 MB、**swap 用量接近 0**。
如果哪天 swap 长期被占着，说明内存涨了，去查是不是多起了什么进程。

---

## 二、这台机器上不装什么（以及为什么）

**不装 Docker、不装 PostgreSQL。** 这不是偏好，是算过账的：

| 不装的东西 | 省下 | 理由 |
|---|---|---|
| Docker / dockerd | **130 MB 常驻内存** + 一层排障 | 这个站连数据库都不用额外进程，再套一层容器在内存上说不通；而且这台机器直连 `registry-1.docker.io` 不通，用 Docker 还得配镜像加速 |
| PostgreSQL 18 | 150-200 MB + 一个 systemd 服务 + 一个端口 + 一套账号密码 + 一种备份方式 | 单机、单管理员、写入不频繁、数据几 MB —— 四条 SQLite 适用条件全中 |
| Redis | 30-50 MB | 缓存用 `unstable_cache` + `revalidateTag`，进程内就够 |
| Nginx | ~10 MB + certbot | Caddy 一条 `handle` 就能反代，证书自动申请续期。**这台机器上 nginx 已 purge，0 包残留**，装的是 Caddy |
| pnpm | 磁盘 + 构建工具链 | 服务器上只跑 `node server.js`，不装依赖、不跑构建 |

**出问题时排障路径只有一条**：`journalctl -u atlas -f`。没有容器、没有数据库服务、
没有反向代理配置的第二层，这也是不装它们换来的好处。

---

## 三、一次性安装（只在第一次做，服务器上已做完）

> 这一节记录**当初装了什么**。服务器现在是就绪状态，重装机器时才需要重跑。

```bash
# 0. 先更新一次索引
apt update && apt upgrade -y

# 1. Node 22（NodeSource 源）→ 实际装出来是 v22.23.3，自带 npm 10.9.9
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v && npm -v

# 2. Caddy —— ★ 用 Ubuntu 官方源，不要加 cloudsmith 第三方源
apt install -y caddy
caddy version                 # 期望 v2.6.2
# 官方源的好处：跟系统一起 apt upgrade，不用单独维护一个第三方源和它的 key

# 3. sqlite3 命令行 —— 备份、恢复和排查用，几 MB
apt install -y sqlite3
sqlite3 --version             # 3.46.1

# 4. 编译工具链 —— 目前用不到，留着以防万一
apt install -y build-essential python3

# 5. 建运行用户和目录
useradd -r -s /usr/sbin/nologin -d /opt/atlas atlas
mkdir -p /opt/atlas/{releases,scripts}
mkdir -p /opt/atlas/data/{uploads/public/{icons,qrcodes,covers},uploads/private,backups,cache}
chown -R atlas:atlas /opt/atlas

# 6. caddy 用户要能读公开图片目录，加进 atlas 组
usermod -aG atlas caddy
```

**验证**：`node -v` / `caddy version` / `sqlite3 --version` 三条都有输出，且
`ls -ld /opt/atlas/data/*` 的属主是 `atlas`。

### 3.1 Node 版本：服务器和本地不需要一致

**这条以前写错了，现在纠正。** 本地是 **Node v24.18.0**，服务器是 **v22.23.3**，
**不一致完全没问题**，不需要"两边一起升"。

原因：`better-sqlite3` v13 已经改用 **N-API 预编译包**——

- npm 包里直接带 `prebuilds/{linux,linuxmusl,darwin,win32}-{x64,arm64}.node` **八个平台的二进制**
- `lib/binding.js` 按 `process.platform` / `process.arch` 自动挑一个加载
- **没有 `build/Release/` 目录**，也不需要按 Node ABI 现场编译

所以既没有 `NODE_MODULE_VERSION mismatch`，也没有 `invalid ELF header`。
Linux 那一个 `.node` 已经在 standalone 产物里了，拷上去直接能跑。

> 详细的实测记录和**真正需要注意的跨平台问题（sharp）**见第十二节 12.4。

### 3.2 `/opt/atlas/scripts/` 是故意放在 releases 外面的

`scripts/backup.sh`、`scripts/restore.sh` 要复制到这里，cron 引用这个**稳定路径**。
放在 release 目录里的话，releases 轮换到第 4 个版本时，你的备份脚本就被一起删了。

```bash
# 仓库里的脚本复制到稳定路径（每次改了脚本都要重跑这两条）
install -m 0755 /opt/atlas/current/scripts/backup.sh  /opt/atlas/scripts/backup.sh
install -m 0755 /opt/atlas/current/scripts/restore.sh /opt/atlas/scripts/restore.sh
```

⚠️ 首次部署时 `/opt/atlas/current` 还不存在，这两条要等第六节首次发布之后再做。

---

## 四、目录结构：releases + current + data

**全机只有这一个部署布局。** 没有 `/opt/apps`，没有 `/var/www/html`——
那些是服务器准备阶段的临时落脚点，已废弃不用。

```
/opt/atlas/
├── current -> releases/20261016-1600/    # ★ 软链，systemd 的 WorkingDirectory 指向它
│
├── releases/                             # 每个版本一个目录，保留最近 3 个
│   ├── 20261016-1600/                    #   当前版本
│   │   ├── server.js                     #   standalone 入口
│   │   ├── .next/
│   │   │   ├── static/                   #   Next 不把它打进 standalone，要手工放
│   │   │   └── cache -> /opt/atlas/data/cache   # ★ 软链，见 5.1
│   │   ├── public/                       #   只放构建期静态资源（当前是空的）
│   │   ├── scripts/                      #   ★ standalone 里没有，必须显式拷
│   │   ├── drizzle/                      #   迁移 SQL，带了才能在服务器上跑迁移
│   │   └── node_modules/                 #   standalone 自带的精简依赖
│   └── 20261016-1500/                    #   上一个版本，回滚用
│
├── scripts/                              # ★ release 外面的稳定路径，cron 引用它
│   ├── backup.sh
│   └── restore.sh
│
├── data/                                 # ★ 永不动，全部持久数据在这里
│   ├── atlas.db                          #   SQLite 主库
│   ├── atlas.db-wal                      #   WAL 日志（和主库一起被 .backup 读走）
│   ├── atlas.db-shm
│   ├── cache/                            #   ★ Next 的 .next/cache 软链到这里
│   ├── uploads/
│   │   ├── public/{icons,qrcodes,covers}/  # 公开图片，Caddy 直接读盘 → /media/...
│   │   └── private/{entryId}/              # 私密图片，只能走 /api/file/... 鉴权路由
│   └── backups/                          #   atlas-2026-10-16.db.gz + before-restore 快照
│
└── .env                                  # 权限 600，属主 atlas
```

三条规则，背下来：

1. **`releases/` 会被新版本整体替换**，所以里面什么都不能存。
2. **`data/` 永远不被部署覆盖**，所有会变的东西（库、图片、缓存、备份）都在这里。
3. **`current` 只是一个软链**，它指向哪个 release 就是哪个版本在跑。

> ### ⚠️ 永远不要在 `current/` 里构建或上传
>
> `current` 是**正在被 `node server.js` 读取**的目录。
> 往里解包或 `next build` 会发生两件事：
>
> - 服务读到写了一半的文件（新的 `server.js` 配旧的 `.next/`），报错不可预测；
> - 覆盖掉正在跑的版本，**回滚就没了** —— 你连"上一个版本"都不存在了。
>
> 正确做法只有一种：**所有操作都在 `releases/{新时间戳}/` 里做完，最后一步才换软链。**

systemd 里写的是 `WorkingDirectory=/opt/atlas/current`，内核会把软链解析成真实路径，
所以应用里 `process.cwd()` 会是 `/opt/atlas/releases/20261016-1600`。**这是正常的**，
不影响任何功能，日志里看到真实路径不要以为配错了。

---

## 五、systemd 单元与 Caddyfile（原文，照抄）

### 5.1 `/etc/systemd/system/atlas.service`

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

# ★ 只留 data/ 可写。配套前提见下方「.next/cache 软链」
ReadWritePaths=/opt/atlas/data

[Install]
WantedBy=multi-user.target
```

五个关键点，别改：

- **`HOSTNAME=127.0.0.1`**：应用只监听本地回环，4000 端口不对公网开放，
  所以阿里云安全组**不需要**开 4000（只开 **你的SSH端口 / 80 / 443**）。
- **`Restart=always`**：进程挂了 3 秒后自动起来，这是没有进程守护工具时的兜底。
- **`ReadWritePaths=/opt/atlas/data`**：`ProtectSystem=strict` 之后整个文件系统只读，
  只有 `data/` 可写。这正好验证了存储设计：应用从不需要往 `releases/` 里写东西。
- **`EnvironmentFile=/opt/atlas/.env`**：配置在 release 外面，换版本不会丢配置。
- **`NEXT_TELEMETRY_DISABLED=1`**：不发遥测，省一次外部请求。

#### ★ `.next/cache` 必须是软链 —— 不做这一条，全站会变慢 + 图片全 500

`ProtectSystem=strict` + `ReadWritePaths=/opt/atlas/data` 意味着 **release 目录是只读的**，
而 Next 默认要往 `<release>/.next/cache` 写两样东西：

1. `next/image` 的优化结果缓存 → 写不进去，**图片优化接口直接 500**（前台卡片、后台表格都用 `next/image`）
2. `unstable_cache` 的增量缓存 → 写不进去，**`src/db/queries.ts` 里所有读查询的缓存全部失效**，整站变慢

所以每个 release 都必须做这一步（`deploy.py` 会自动做，手工发布时别忘）：

```bash
REL=/opt/atlas/releases/20261016-1600
rm -rf "$REL/.next/cache"
ln -s /opt/atlas/data/cache "$REL/.next/cache"
ls -ld "$REL/.next/cache"        # 期望：... -> /opt/atlas/data/cache
```

### 5.2 `/etc/caddy/Caddyfile`

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

	# 压缩。zstd 给支持的浏览器，gzip 兜底
	encode zstd gzip

	# ─────────────────────────────────────────────────────────────
	#  公开图片：Caddy 直接读盘，不经 Node
	#
	#  ⚠️⚠️ 这一段里的安全头是「生产环境唯一生效的一道 SVG 兜底」。
	#
	#  src/app/media/[...path]/route.ts 里对 .svg 也加了同样的 CSP，
	#  但那个路由在生产环境**根本不会执行** —— 就是被这个 handle 抢先接管了。
	#  只在路由里写 = 生产环境实际少一层防护。
	#  两处的头必须保持一致，改一处要同步改另一处。
	# ─────────────────────────────────────────────────────────────
	handle /media/* {
		root * /opt/atlas/data/uploads/public

		header {
			# SVG 当文档打开时：禁止加载任何外部资源、禁止脚本
			Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; sandbox"
			X-Content-Type-Options nosniff
			# 文件名带内容指纹（见 src/lib/storage.ts），所以可以长缓存
			Cache-Control "public, max-age=31536000, immutable"
		}

		# SVG 额外一层：不给「当文档直接打开」的机会。
		# 作为 <img> 子资源加载时浏览器会忽略 Content-Disposition，所以站内图标显示不受影响。
		@svg path *.svg
		header @svg Content-Disposition "attachment"

		file_server
	}

	# 边缘存活探针
	# ⚠️ 这只证明 Caddy 活着，不证明 Node 应用活着。
	#    想知道应用活没活，看 `/` 的返回码（502 = 应用没起来）。
	handle /health {
		respond "OK" 200
	}

	# 其余全部交给 Node 应用（只监听 127.0.0.1:4000，不对公网暴露）
	handle {
		reverse_proxy 127.0.0.1:4000
	}

	# 应用没起来时给一句能看懂的话，而不是干巴巴的 502
	#
	# ⚠️ 这里用 expression 而不是 `status 500 502 503 504`：
	#    http.matchers.status 是 Caddy 2.7 才加的模块，本机是 2.6.2，
	#    写 `@err5xx status 500` 会直接 validate 失败（module not registered: http.matchers.status）。
	#    查可用 matcher：caddy list-modules | grep matcher
	handle_errors {
		@err5xx expression {err.status_code} >= 500
		handle @err5xx {
			respond "服务暂时不可用（HTTP {err.status_code}）。若刚重启过服务器，请等 5 秒刷新；持续这样请看 journalctl -u atlas -n 50" 503
		}
	}

	# 站点级响应头（对所有响应生效，包括 handle 内部的）
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		# 不回 Server 头，别告诉扫描器我用的什么
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

- `handle` 是**互斥**的，按书写顺序匹配：先 `/media/*`，再 `/health`，剩下的才走反代，顺序不要调。
- `immutable` 缓存头只对 `/media/*` 生效。图片文件名带 slug、内容变了就换名，
  所以可以放心让浏览器缓存一年。
- **`Content-Security-Policy` 那几个头不能删。** 它和 `src/app/media/[...path]/route.ts` 里的是同一套，
  但生产环境只有 Caddy 这一份会真正发出去（原因见 `SERVER-SECURITY` 那段注释，也在 `src/lib/svg.ts` 顶部）。
- **有域名之后**：改第一行的 `:80` → `你的域名`，然后
  `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`，
  Caddy 自动申请并续期证书，不需要 certbot、不需要写续期任务。
  前提是**阿里云安全组已放行 80 和 443**，且域名 A 记录已指向 `你的服务器IP`。
- Caddy 是 **2.6.2**（Ubuntu 官方源）。升级走 `apt upgrade`，别加 cloudsmith 第三方源。

```bash
systemctl daemon-reload
systemctl enable atlas            # 只置开机自启，先别 start —— current 软链要等首次发布才有
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
journalctl -u atlas -f            # 看应用日志
```

⚠️ 顺序别搞反：`enable` 可以现在做，`start` 要等第六节的首次发布（那时才有 `current`）。

---

## 六、首次部署（从空机到首页能打开）

### 6.1 写 `/opt/atlas/.env`

```bash
cat > /opt/atlas/.env <<'EOF'
# ── 数据库与上传（必须是绝对路径）──
# 不能用相对路径：process.cwd() 是 release 目录（软链被内核解析掉了），
# 相对路径会指进只读的 release 里 —— 写不进去，或者数据跟着 release 被轮换删掉。
DATABASE_PATH=/opt/atlas/data/atlas.db
UPLOAD_DIR=/opt/atlas/data/uploads

# ── 认证 ──
# 和本地开发用的必须不同：换掉它 = 所有旧 session 立即失效。
AUTH_SECRET=（openssl rand -base64 32 生成）

# ★ ADMIN_EMAIL / ADMIN_PASSWORD 在这里【不起作用】：
#   管理员账号存在 settings 表 key='admin'（{"email","passwordHash"}），
#   本来由本地的 pnpm db:seed 写入，但服务器上没有 pnpm/tsx，跑不了 seed。
#   正确做法见 6.3。所以这两行故意不写。

# ── 站点 ──
# 现在没有域名，用公网 IP。有域名后改成 https://你的域名 并【重新构建】。
NEXT_PUBLIC_SITE_URL=http://你的服务器IP

# ── 定时任务鉴权（供 /api/cron/* 使用）──
CRON_TOKEN=（随机字符串，openssl rand -hex 24 生成）

# ── 高德地图（可选，两个 key 不是同一个）──
# AMAP_KEY                = Web 服务 key，用于「地址 → 经纬度」地理编码（后台用）
# NEXT_PUBLIC_AMAP_JS_KEY = Web 端 JS API key，用于好店地图页画底图（前台用）
# ⚠️ NEXT_PUBLIC_* 是【构建期内联】的：写在这里对已经构建好的客户端包无效，
#    必须在【本地 pnpm build 之前】写进 .env.local 或构建时的环境变量。
#    这里保留一行只为提醒，值配在本地。

TZ=Asia/Shanghai
EOF

chown atlas:atlas /opt/atlas/.env
chmod 600 /opt/atlas/.env
openssl rand -base64 32          # 这一条的输出填给 AUTH_SECRET
openssl rand -hex 24             # 这一条的输出填给 CRON_TOKEN
```

⚠️ **两个 `NEXT_PUBLIC_*` 变量的坑**（`NEXT_PUBLIC_SITE_URL` 和 `NEXT_PUBLIC_AMAP_JS_KEY`）：

它们是**构建期内联**的 —— `next build` 时被替换成字面量写进客户端 bundle。
所以：

- ✅ 配在**本地** `.env.local`，或者在 `pnpm build` 前设成环境变量
- ❌ 只写进服务器这个 `.env`，对**已经构建好的**客户端包**完全无效**

`deploy.py` 已经处理了 `NEXT_PUBLIC_SITE_URL`（用 `--site-url` 传给构建环境，
默认 `http://你的服务器IP`）。**`NEXT_PUBLIC_AMAP_JS_KEY` 要在本地 `.env.local` 里配好**，
否则好店地图页画不出底图，而且服务器上怎么改都救不回来 —— 必须重新构建。

⚠️ `.env` 放在 `/opt/atlas/`（releases 外面），所以它**不会**被任何一次发布覆盖。
这也是它能安全放着 `AUTH_SECRET` 的原因。

### 6.2 建库：跑一次迁移

**服务器上没有 pnpm / tsx**，所以不能 `pnpm db:migrate`。
项目里有一个纯 Node 写的迁移器 `scripts/migrate.mjs`（只用 `node:crypto` + `better-sqlite3`），
它落在 release 的 `scripts/` 里（发布时会显式拷进去，见 7.1）：

```bash
cd /opt/atlas/current
DATABASE_PATH=/opt/atlas/data/atlas.db node scripts/migrate.mjs
```

它的落库格式与 drizzle 官方 migrator **逐字节一致**（`__drizzle_migrations` 的
hash = sha256(SQL 文件内容)、created_at = journal 的 `when`），
所以服务器跑完再回本地跑 `pnpm db:migrate` **不会重复应用**。

库文件会自动创建，**目录不存在时应用也会自己建**（`src/db/index.ts` 里有 `mkdirSync`）。

### 6.3 建管理员账号（这一步不做就登不进去）

**本项目没有 `users` 表。** 管理员账号存在 `settings` 表 `key='admin'` 里，值是 JSON：

```json
{"email": "you@example.com", "passwordHash": "$2b$10$...（bcrypt 哈希，不存明文）"}
```

服务器上没有 pnpm/tsx，所以**不能跑 `pnpm db:seed`**。正确做法是分两步：

```powershell
# ① 本地生成 bcrypt hash（在你的项目目录里跑，用到仓库里的 bcryptjs）
cd 你的项目目录
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" '你的新密码'
# → 复制输出，形如 $2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
# ② 服务器上写库
#    ⚠️ 先停应用（避免和正在跑的进程抢 SQLite 写锁）
systemctl stop atlas

sqlite3 /opt/atlas/data/atlas.db "UPDATE settings \
  SET value = json_set(value, '\$.passwordHash', '上一步生成的hash值') \
  WHERE key = 'admin';"

# 邮件地址一起改（可选）
sqlite3 /opt/atlas/data/atlas.db "UPDATE settings \
  SET value = json_set(value, '\$.email', 'you@example.com') \
  WHERE key = 'admin';"

# 确认写进去了
sqlite3 /opt/atlas/data/atlas.db "SELECT key, json_extract(value,'\$.email') AS email,
  substr(json_extract(value,'\$.passwordHash'),1,12)||'…' AS hash_head FROM settings WHERE key='admin';"

systemctl start atlas
```

> **`sqlite3` 里的 `$` 要转义成 `\$`**（在双引号里），否则 shell 会当成变量展开。
> 嫌麻烦就把整个 SQL 写成文件再 `sqlite3 db < file.sql`。

安全提醒：登录失败**只有 `sleep(500)`，没有限速也没有锁定**，
所以密码必须够强（别用能猜到的）。Session 策略是 `jwt`，有效期 30 天；
换掉 `AUTH_SECRET` 可以一次性踢掉所有已登录会话。

### 6.4 首次发布

用 `deploy.py` 走一遍（第七节讲原理）：

```powershell
cd 你的运维目录
python deploy.py --site-url http://你的服务器IP
```

**首次的顺序**是：构建 → 组装（删 `data/`、补 `scripts/` 和 `drizzle/`）→ tar → SFTP 上传
→ 服务器解到 `releases/{时间戳}` → **建 `.next/cache` 软链** → `chown` → 换软链 → `systemctl start atlas`
→ 烟测 → 清理旧版本（首次没有旧的，跳过）。

⚠️ **迁移要在第一次发布之后、切软链之前或之后都行，但必须做**（见 6.2）。
首次 `current` 还不存在时，直接用写死的路径：

```bash
cd /opt/atlas/releases/20261016-1600
DATABASE_PATH=/opt/atlas/data/atlas.db node scripts/migrate.mjs
```

### 6.5 首次要做完的六件事

```bash
# 1. 把脚本复制到 release 外面的稳定路径（现在 current 存在了）
install -m 0755 /opt/atlas/current/scripts/backup.sh  /opt/atlas/scripts/backup.sh
install -m 0755 /opt/atlas/current/scripts/restore.sh /opt/atlas/scripts/restore.sh

# 2. 建管理员账号（见 6.3，不做就登不进去）
#    ⚠️ 一定要在跑完迁移之后做，settings 表得先存在

# 3. 备份脚本挂到宿主 crontab（用 atlas 用户跑，备份文件属主才对）
crontab -u atlas -e
#   写入这三行：
#   SHELL=/bin/bash
#   0 3 * * * /opt/atlas/scripts/backup.sh 2>&1 | logger -t atlas-backup
#   0 4 * * * curl -fsS -H "x-cron-token: <CRON_TOKEN>" http://你的服务器IP/api/cron/qrcodes 2>&1 | logger -t atlas-qrcodes

# 4. 手工跑一次备份，确认能生成文件
sudo -u atlas /opt/atlas/scripts/backup.sh

# 5. ★ 立刻用这份备份实测一次恢复（恢复到一个测试库，不覆盖线上）
#    完整流程见第十一节，没做这一步等于没有备份

# 6. 确认两个服务都开机自启
systemctl is-enabled atlas caddy
```

#### 为什么第 3 步必须加 `/api/cron/qrcodes` 那一行

过期二维码下架只有**两个触发口**：① `/api/cron/qrcodes`（**需要自己配 crontab**，就是本节第 3 步那一行）
② 后台「一键停用所有已过期的码」按钮。**没配 cron，「自动」就永远不会发生。** 后果：

- 微信群码过了 7 天有效期还会继续挂在页面上 —— 用户扫出来看到"二维码已过期"，站就不可信了

`/api/cron/link-check` 同理（外链巡检）。**加不加这一行是可选**：巡检不是「不做就出事」的功能，
条目失效最终靠人去后台确认。想每天跑就加一行（巡检比较慢，挑访问低谷）：

```bash
#   30 5 * * * curl -fsS -H "x-cron-token: <CRON_TOKEN>" http://你的服务器IP/api/cron/link-check 2>&1 | logger -t atlas-linkcheck
```

> **服务器在国内机房，ChatGPT / Gemini / Claude / Grok / Mistral / Llama / HuggingFace
> 这些站直连就是 8 秒超时**，所以巡检默认跳过它们（名单在 `src/lib/link-check.ts` 的
> `DEFAULT_SKIP_HOSTS`，可用 `LINK_CHECK_SKIP_HOSTS` 覆盖，设成空串表示一条都不跳）。
> 想要连它们也巡检，得先给服务器配外网出口 —— 但那样要多挂一个常驻进程，
> 2 GB 的机器上不值当（见第 2 节）。
> 这一批条目的死活**手动标记**就行：后台按 `status` 筛、直接改状态。

查 cron 有没有跑：`journalctl -t atlas-qrcodes --since "7 days ago"`。
手工触发一次看效果：

```bash
curl -fsS -H "x-cron-token: $(grep '^CRON_TOKEN=' /opt/atlas/.env | cut -d= -f2)" \
  http://你的服务器IP/api/cron/qrcodes
```

> 两个接口都同时支持 `GET` 和 `POST`，token 走 `x-cron-token` 请求头。
> **站点地址别硬编码域名** —— 现在没有域名，就用 `http://你的服务器IP`；
> 有域名之后把这两行里的地址一起改掉。

---

## 七、每次发布 · 方案 A（默认：本地构建 → tar → SFTP）

**核心思路：传到新目录，换软链，重启。旧版本原封不动留着，随时能回滚。**

### 7.1 一键（推荐）

```powershell
cd 你的运维目录
python deploy.py                      # 全流程
python deploy.py --no-build           # 跳过构建，用现有 .next 产物
python deploy.py --site-url https://你的域名   # 有域名后
python deploy.py --list               # 看服务器上有哪些 release
python deploy.py --rollback 版本号      # 回滚
python deploy.py --logs               # 看 atlas 最近 60 行日志
```

`deploy.py` 会自动做完这七步：构建 → 组装 → tar → SFTP → 服务器解包 → 软链 → 重启 → 烟测 → 清理。

### 7.2 手工版（脚本坏了时你需要能自己来一遍）

```powershell
cd 你的项目目录

# 1. 版本号（release 目录名，也是回滚时要用的名字）
$rel = Get-Date -Format "yyyyMMdd-HHmm"

# 2. 本地构建
pnpm build

# 3. 组装产物到本地暂存目录
$stage = ".\dist-deploy"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item ".next\standalone\*" $stage -Recurse -Force
New-Item -ItemType Directory -Force "$stage\.next" | Out-Null
Copy-Item ".next\static" "$stage\.next\static" -Recurse -Force
Copy-Item "public"  "$stage\public"  -Recurse -Force
# ★ standalone 里【没有】这两个目录，必须显式拷
Copy-Item "scripts" "$stage\scripts" -Recurse -Force
Copy-Item "drizzle" "$stage\drizzle" -Recurse -Force

# ★ 必须删掉 data/，原因见 7.3
Remove-Item "$stage\data" -Recurse -Force -ErrorAction SilentlyContinue

# 4. 打 tar.gz（tar.exe 是 Windows 自带的，不用装）
tar.exe -czf "dist-deploy-$rel.tar.gz" -C $stage .

# 5. 上传 + 解包 + 换软链（没有 rsync，用 SFTP）
python ..\你的运维目录\deploy.py --no-build --version $rel
```

**关于传输方式**：本机（Windows）**没有 rsync**。
旧文档里的 `rsync -avz` 在这台机器上根本跑不了。现在的做法是
**`tar` 打包 → SFTP 上传 → 服务器解包**，全部由 `deploy.py` 封装（它用 `paramiko` 的 SFTP）。

**关于 `ssh aliyun`**：`aliyun` 是 `~/.ssh/config` 里的 Host 别名，**只有它能直接连**
（别名里带着 `Port 你的SSH端口` 和私钥路径）。要手写完整命令的话：

```powershell
ssh -p 你的SSH端口 -i ~/.ssh/id_ed25519 root@你的服务器IP "命令"
```

`ssh root@你的服务器IP` **一定失败** —— 22 已关闭、密码登录也已关闭。

**如果这次带了 schema 改动**：在换软链之前按第九节做「备份 → 停服 → 迁移」。
没有 schema 改动就跳过，全程不用停服，用户感知只有重启那 2 秒。

### 7.3 三件容易漏的事（每一个都会出事）

**① `data/` 必须从产物里删掉**

`next build` 会因为 `src/lib/storage.ts` 里的
`path.resolve(process.cwd(), './data/uploads')` 被 Next 的**文件追踪**命中，
把本地 `data/uploads` 整棵打进 `.next/standalone/`。

不删的后果：**你本地的陈旧上传混进 release**，而且违反
「`releases/` 里什么都不能存」这条铁律。`deploy.py` 会自动删并打印删了几个文件。

**② `scripts/` 必须显式拷**

`standalone` 只包含应用**真正 import 到**的模块，`scripts/` 不在其中。
不拷的话 `/opt/atlas/current/scripts/backup.sh` **永远不存在**，
第 6.5 节的 `install` 命令会失败，cron 也指向一个空路径 —— **备份静默地从来没跑过**。

**③ `drizzle/` 必须显式拷**

同理，服务器上跑 `node scripts/migrate.mjs` 要读 `drizzle/*.sql`。
不拷的话迁移直接报找不到迁移文件。

### 7.4 为什么不会碰到 `data/`

旧的 rsync 方案靠 `--delete` 的作用域来保证，现在用 tar 反而更简单：

- **本地组装时就把 `data/` 删了**，所以包里根本没有它；
- 上传目标是 `/opt/atlas/incoming/`，解包目标是**新建的** `releases/{时间戳}/`；
- `/opt/atlas/data/` 和 `current` 从头到尾都不是任何一步的目标。

`data/` 唯一的写入方是应用自己（`ReadWritePaths=/opt/atlas/data`）。

### 7.5 发布后 30 秒自检

```bash
python deploy.py --list          # 一条命令看全：releases / current / 服务状态 / 资源
```

手工版：

```bash
ssh aliyun "ls -l /opt/atlas/current && systemctl is-active atlas"
ssh aliyun "journalctl -u atlas -n 30 --no-pager"
ssh aliyun "ls -ld /opt/atlas/current/.next/cache"     # ★ 必须是指向 data/cache 的软链
curl -sI http://你的服务器IP/                          # 200
curl -sI http://你的服务器IP/media/icons/任意已有图标.png | grep -i cache-control    # immutable
```

首页能打开、`.next/cache` 是软链、`cache-control` 里有 `immutable`、日志里没有反复重启 —— 四条都过才算发布完成。

---

## 八、每次发布 · 方案 B（服务器上构建的备选）

**什么时候用它**：人在外面只有手机、需要紧急改一个错别字。

> ⚠️ 旧文档写「跨平台的 better-sqlite3 问题折腾不通就切方案 B」——
> **这个理由已经不存在了**（v13 是 N-API 预编译包，见 3.1 和 12.4）。

### 8.1 命令（在服务器上跑）

```bash
# 一次性：方案 B 需要 pnpm 和 git（方案 A 不需要）
apt install -y git
npm install -g pnpm

cd /opt/atlas/releases
RELEASE=$(date +%Y%m%d-%H%M)
git clone --depth 1 https://github.com/ClearloveLX/shanhaiji-atlas.git "$RELEASE"   # 必须是【新】目录，不能是 current
cd "$RELEASE"
cp /opt/atlas/.env .env                          # 构建时读得到变量（.env 不进 Git）
pnpm install --frozen-lockfile
pnpm build

# 构建期间旧版本还在正常服务，只是会慢。构建完再换软链：
ln -sfn /opt/atlas/releases/$RELEASE /opt/atlas/current
systemctl restart atlas
systemctl is-active atlas

cd /opt/atlas/releases && ls -1t | tail -n +4 | xargs -r rm -rf
```

⚠️ 方案 B 的 release 里**有完整源码**，但**仍然要做 `.next/cache` 软链**（只做一次，之后它会在原地）：

```bash
rm -rf /opt/atlas/releases/$RELEASE/.next/cache
ln -s /opt/atlas/data/cache /opt/atlas/releases/$RELEASE/.next/cache
```

### 8.2 代价（写清楚，别自我欺骗）

| | 方案 A（本地构建 + tar/SFTP） | 方案 B（服务器构建） |
|---|---|---|
| 耗时 | **约 40 秒**（tar + SFTP 约 30 秒） | **5-15 分钟**（首次更久，要下载依赖） |
| 部署期间站点状态 | 全程正常 | **全程变慢**：`node server.js` 的常驻内存被换出到 swap，响应从几十毫秒变成几秒 |
| 会不会 OOM | 不会 | **不会**（2 GB swap 已实测扛住 1800 MB 分配），但会一直听到磁盘在响 |
| 服务器磁盘 | 最小 | +400~700 MB（node_modules + pnpm store），32 GB 可用空间够用但要定期清理 |
| 服务器要装 | 只要 Node + Caddy | Node + Caddy + pnpm + git + 全部 devDependencies + build-essential |
| 能否离开本机部署 | ❌ 必须在你 Windows 上 | ✅ **任何能 SSH 的地方，包括手机** |
| 一次性配置成本 | 无 | 无 |

注意事项：

- 构建期间**不要**重启服务，让它跑完再换软链。
- 构建时盯一眼 `free -m`：**swap 用量超过 1.5 GB 说明情况比预期糟**，
  考虑回到方案 A（或先去查是不是同时还有别的东西在吃内存）。
- 磁盘要留够：`pnpm store prune` 可以回收 pnpm store 里的旧包。

### 8.3 `pnpm-workspace.yaml` 里的 `nodeLinker: hoisted`

仓库根目录有一行：

```yaml
nodeLinker: hoisted
```

**它是给 Windows 开发机用的**：pnpm 默认布局用符号链接组织 `node_modules`，
而 Windows 非管理员账户（开发者模式关着时）没有 `SeCreateSymbolicLinkPrivilege`，
`next build` 在 `output: 'standalone'` 下要按 traced 文件重建符号链接，
于是直接 `EPERM` 报错、构建失败。改成 `hoisted` 后 `node_modules` 里是真实目录，构建正常。

**在 Linux 服务器上走方案 B 时，这一行可以去掉**（Linux 建符号链接不需要特权，
默认的 `isolated` 布局更省磁盘），但**不改也是安全的**，只是多用一点磁盘。

⚠️ 如果要在服务器那个克隆副本里改，**不要提交回仓库、也不要同步回开发机** ——
删掉之后 Windows 上的 `pnpm build` 会重新撞上 `EPERM`。

---

## 九、数据库迁移怎么在服务器上跑

服务器上没有 pnpm、没有 tsx，所以不能 `pnpm db:migrate`。
用 release 里的纯 Node 迁移器 `scripts/migrate.mjs`：

```bash
# 变体 A：已经有一个在跑的版本（日常发布时用这个）
REL=$(basename "$(readlink -f /opt/atlas/current)")

# 变体 B：首次部署，current 还不存在 —— 直接把刚传上去的目录名写死
# REL=20261016-1600

cd "/opt/atlas/releases/$REL"
ls scripts/migrate.mjs drizzle/           # 确认迁移器和 SQL 都随发布传上来了

# ★ 动手前先备份（迁移会改表结构，这是唯一不可逆的一步）
/opt/atlas/scripts/backup.sh

# 停服务：迁移期间不允许再写库
systemctl stop atlas

DATABASE_PATH=/opt/atlas/data/atlas.db node scripts/migrate.mjs

# 换软链 + 起服务（只在"单独跑迁移、不发新版本"时才需要这两行）
ln -sfn "/opt/atlas/releases/$REL" /opt/atlas/current
systemctl start atlas
systemctl is-active atlas
```

⚠️ **嵌在第七节的发布流程里做迁移时**：这里只做「**备份 → 停服 → 迁移**」这三步，
换软链和重启交给发布流程，**软链不要在两处各换一次**，
否则你分不清最终生效的是哪个版本。

排错：

- 报 `Cannot find module 'better-sqlite3'`：release 里的 `node_modules` 不完整
  （正常不会发生 —— standalone 会带上它）。确认 `ls node_modules/better-sqlite3/prebuilds/`
  里有 `linux-x64.node`，没有就重新发布一次。
- 报 `SQLITE_BUSY`：说明还有进程在写库（服务没停干净）。
  `systemctl stop atlas` 之后 `ps aux | grep server.js` 确认没有残留进程再跑。
- 报找不到 `drizzle/` 下的 SQL：发布时漏拷了 `drizzle/`（见 7.3 ③）。

⚠️ **不要用 `sqlite3 < drizzle/0001_xxx.sql` 手工执行迁移文件。**
drizzle 在 `__drizzle_migrations` 表里记着"执行到第几个迁移"，
手工执行不入账，下次迁移会从旧的位置重来，报 `table already exists` 之类，
到时候修起来比重装一遍麻烦。

---

## 十、回滚（一条命令）

```bash
python deploy.py --list                            # 先看有哪些版本，挑上一个
python deploy.py --rollback 版本号          # 换软链 + 重启 + 验证
```

手工版：

```bash
ssh aliyun "cd /opt/atlas/releases && ls -1t"
ssh aliyun "ln -sfn /opt/atlas/releases/20261016-1500 /opt/atlas/current && systemctl restart atlas && systemctl is-active atlas"
```

**2 秒完成，不用重新构建，不用重新上传。** 这是 release + 软链结构最值钱的地方。

- `releases/` 保留**最近 3 个**版本，第 4 个在每次发布时被删掉。
- ⚠️ 回滚**只回代码，不回数据库**。如果这次发布跑了迁移（加了列/表），
  旧代码读新表通常是安全的（本项目都是**加**字段，不删不改名）；
  但如果迁移里删过东西，回滚要连库一起回：

  ```bash
  ssh aliyun "/opt/atlas/scripts/restore.sh /opt/atlas/data/backups/atlas-2026-10-16.db.gz"
  ```

- ⚠️ 回滚之后别忘了把软链**换回来验证一次**，只停在一个方向上测试等于没测。

---

## 十一、备份与恢复

### 11.1 备份：`scripts/backup.sh`

```bash
# 手工跑一次
/opt/atlas/scripts/backup.sh

# 换路径跑（环境变量可覆盖）
DB=/opt/atlas/data/atlas.db DEST=/opt/atlas/data/backups KEEP=30 /opt/atlas/scripts/backup.sh
```

- 默认 `/opt/atlas/data/atlas.db` → `/opt/atlas/data/backups/atlas-YYYY-MM-DD.db.gz`。
- **必须用 `sqlite3 "$DB" ".backup '$DEST'"`（脚本里就是这么写的），绝对不能用 `cp`。**
  WAL 模式下主库文件单独复制出来是不一致的：已提交的事务可能还在 `atlas.db-wal` 里，
  拷出来的是**缺最近写入**的库，而这个问题备份当天看不出来。
- 脚本会 `PRAGMA quick_check` 校验快照，再 gzip，再只保留最近 30 份。
- 每天 3 点自动跑（宿主 crontab + `logger`，结果进 syslog）：

  ```bash
  crontab -u atlas -l | tail -3
  # SHELL=/bin/bash
  # 0 3 * * * /opt/atlas/scripts/backup.sh 2>&1 | logger -t atlas-backup
  # 0 4 * * * curl -fsS -H "x-cron-token: <CRON_TOKEN>" http://你的服务器IP/api/cron/qrcodes 2>&1 | logger -t atlas-qrcodes
  ```

  查历史：`journalctl -t atlas-backup --since "30 days ago" | tail -40`

### 11.2 恢复：`scripts/restore.sh`

```bash
# 参数是备份文件路径；会要求输入 yes 二次确认
/opt/atlas/scripts/restore.sh /opt/atlas/data/backups/atlas-2026-10-16.db.gz
```

脚本按顺序做七件事，每一步都打印：解压 → 校验备份 → 停 atlas → 把当前库另存为
`atlas-before-restore-时间戳.db` → 替换主库并清掉旧 `-wal`/`-shm` → 校验并打印条目数
→ 重启 atlas 并确认 `active`。

- 确认那一步**必须手工输入 `yes`**，没有 `--yes` 之类的开关 ——
  恢复错文件 = 线上数据整体回退，唯一退路就是第 4 步那份现场快照。
- 恢复期间站点会中断几十秒，选没人的时候做。

### 11.3 不覆盖线上库的演练（每季度做）

```bash
gunzip -c /opt/atlas/data/backups/atlas-2026-10-16.db.gz > /tmp/atlas-verify.db
sqlite3 /tmp/atlas-verify.db "PRAGMA integrity_check;"          # 期望 ok
sqlite3 /tmp/atlas-verify.db "select count(*) from entries;"     # 和后台显示的条数对得上
sqlite3 /tmp/atlas-verify.db "select count(*) from entry_tags;"
rm -f /tmp/atlas-verify.db
```

### 11.4 铁律

> **没实测过的备份等于没有备份。**

备份脚本不报错、文件也在长，这些都证明不了什么 —— 只有真的从备份里恢复出一次
能读的库，才算验证过。至少要验证过一次「解压 → `integrity_check` → 条目数对得上」，
每年再真跑一次 `restore.sh`。

---

## 十二、常见故障处理

### 12.1 服务起不来

```bash
systemctl status atlas --no-pager -l
journalctl -u atlas -n 100 --no-pager
journalctl -u atlas -f                    # 边看边重启
```

按这个顺序排查：

| 现象 | 大概率原因 | 处理 |
|---|---|---|
| `Cannot find module '/opt/atlas/current/server.js'` | 软链指向了不存在的 release，或 release 被清理了 | `ls -l /opt/atlas/current`，挑一个存在的 release 重设软链 |
| `EADDRINUSE` | 4000 被别的东西占了（很少见） | `ss -lntp \| grep 4000` |
| `EACCES` 打开 `data/atlas.db` | 库的属主/权限不对 | `chown atlas:atlas /opt/atlas/data -R && chmod 640 /opt/atlas/data/atlas.db` |
| `EROFS: read-only file system` 写上传目录 | systemd 的 `ReadWritePaths` 没包含那个路径 | 上传必须落 `data/uploads/`，别往 `releases/` 写 |
| **图片优化接口 500、整站变慢** | **`.next/cache` 没软链到 `data/cache`** | 见 5.1，补软链后重启 |
| 启动后立刻退出、日志里有 `unstable_cache`/环境变量缺失 | `.env` 少键 | `systemctl cat atlas` 确认读的是 `/opt/atlas/.env` |

配好一次的验证方式：

```bash
curl -I http://127.0.0.1:4000        # 服务器本机通
curl -I http://你的服务器IP:4000    # 外网必须【不通】（只监听回环）
```

### 12.2 站点 502（应用没起来）

Caddy 活着但应用挂了，表现是 502（Caddyfile 里配了 `handle_errors`，
会返回一句中文提示而不是干巴巴的 502）。

```bash
systemctl is-active caddy atlas
journalctl -u atlas -n 50 --no-pager
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/
ls -l /opt/atlas/current
```

排查顺序：`atlas` 是否 active → `current` 软链是否指向存在的目录 → 日志里的第一个报错。

### 12.3 HTTPS / 证书（现在还没有域名，暂时用不到）

**现状**：站点地址是 `:80`，纯 HTTP，没有证书。

**有域名之后**要做的：

1. 改 `/etc/caddy/Caddyfile` 第一行 `:80` → `你的域名`
2. `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`
3. 前置条件：**阿里云安全组放行 80 和 443**、**域名 A 记录指向 `你的服务器IP`**
   （`dig +short 你的域名` 确认），否则 Caddy 会一直重试申请
4. 改完记得在本地用 `python deploy.py --site-url https://你的域名` **重新构建一次**
   （`NEXT_PUBLIC_SITE_URL` 是构建期内联的，见 6.1）

证书出问题时的排查：

```bash
journalctl -u caddy -n 100 --no-pager
tail -50 /var/log/caddy/atlas.log
curl -vI https://你的域名 2>&1 | grep -i expire     # 看有效期，正常还有几十天
systemctl restart caddy                              # 强制重试
```

Caddy 自己管续期，正常情况下永远不用管。

### 12.4 跨平台依赖（旧结论作废，新坑是 sharp）

#### ✅ `better-sqlite3` —— 这个问题**不存在了**

**这条以前写错了，现在纠正。** 旧文档说 Windows 上装的二进制拷到 Linux 会报
`invalid ELF header` 或 `NODE_MODULE_VERSION mismatch`，**在 v13 上不成立**。

实测结论：

- npm 包里直接带 `prebuilds/{linux,linuxmusl,darwin,win32}-{x64,arm64}.node` **八个平台**
- `lib/binding.js` 按 `process.platform` / `process.arch` 自动挑一个加载
- **没有 `build/Release/` 目录**，不需要按 Node ABI 现场编译

服务器上 `npm install better-sqlite3@13` 的实测：8 个 prebuilds 全部就位，
`build/Release` 不存在，`:memory:` 建表插入查询全部正常，`sqlite_version()` = 3.53.4。

**所以这些做法全部作废：**

| 作废的做法 | 为什么不需要了 |
|---|---|
| `--exclude "node_modules/better-sqlite3"` | standalone 里已经带着 Linux 要用的 `.node` |
| 服务器上再 `npm install better-sqlite3` | 同上，多此一举 |
| "服务器 Node 主版本必须和本地一致" | N-API 不绑 ABI，本地 v24 配服务器 v22 没问题 |
| 为此改走方案 B | 这个理由消失了 |

唯一保留的一条：`next.config.ts` 里必须有

```ts
serverExternalPackages: ['better-sqlite3']
```

否则 Next 会试图把它打进 bundle，原生模块打不进去会报错。（已经有了。）

#### ⚠️ `sharp` —— 这个才是**真实存在**的跨平台问题

**症状**：Windows 上构建、部署到 Linux 后，**全站图标全裂**。
前台卡片和后台表格都用 `next/image`，所以看起来是"图片全挂了"。

**原因**：

- Next 15 的图片优化器内部 `require('sharp')`
  （`node_modules/next/dist/server/image-optimizer.js:208`）
- sharp 的真正二进制不在 sharp 包本体里，而是 optionalDependencies 里的几个
  **平台专用包**（命名规则 `@img/sharp-平台-架构`，Linux x64 那两份就是
  `@img/sharp-linux-x64` + `@img/sharp-libvips-linux-x64`）
- pnpm **默认只装当前平台**那一份 → Windows 上只带 `sharp-win32-x64`，
  拷到 Linux 后 `require('sharp')` 找不到 linux-x64

**修法**（已经落地在 `pnpm-workspace.yaml`）：

```yaml
supportedArchitectures:
  os: [win32, linux]
  cpu: [x64]
  libc: [glibc]
```

**实测生效**：`@img/sharp-linux-x64` + `@img/sharp-libvips-linux-x64` 已装，
且 Next 的 tracing 已把它们带进 `.next/standalone/node_modules/@img/`
（415 KB 的 `sharp-linux-x64-0.35.5.node`）。

**验证方法**（发布后检查产物里有没有）：

```powershell
Get-ChildItem ".next\standalone\node_modules\@img" -Recurse -Filter "*.node" | Select-Object Name,Length
# 期望看到 sharp-linux-x64-*.node
```

```bash
# 服务器上确认
ls /opt/atlas/current/node_modules/@img/
```

**这一条如果漏了，表现是"图片全裂"而不是报错** —— 日志里可能只有一行 sharp 加载失败。
换新机器/重装依赖后一定要确认这几行还在 `pnpm-workspace.yaml` 里。

---

## 十三、一年后要检查什么

```bash
# 1. 磁盘：32 GB 可用空间是怎么被吃掉的
df -h /
du -sh /opt/atlas/* | sort -h
du -sh /opt/atlas/data/uploads/* /opt/atlas/data/backups
```

| 检查项 | 命令 / 位置 | 健康标准 | 不对劲时怎么办 |
|---|---|---|---|
| 磁盘占用 | `df -h /` | 使用率 < 80% | releases 只留 3 个；`pnpm store prune`（方案 B 才有 store）；清 `/var/log/caddy/` 老日志 |
| 备份还在生成吗 | `ls -lht /opt/atlas/data/backups \| head -5` | 最新一份是**今天或昨天** | 查 `journalctl -t atlas-backup --since "7 days ago"`；crontab 掉了就重加；磁盘满也会导致备份失败 |
| 备份能恢复吗 | 第十一节 11.3 / 11.4 | 这一季跑过至少一次 | 立刻补跑，别拖到真出事 |
| **过期二维码有自动下架吗** | `journalctl -t atlas-qrcodes --since "7 days ago"` | 每天有一条 | cron 里的 `/api/cron/qrcodes` 掉了（见 6.5） |
| releases 有没有堆积 | `ls -1t /opt/atlas/releases` | 只有 3 个 | 手工删最老的：`cd /opt/atlas/releases && ls -1t \| tail -n +4 \| xargs -r rm -rf` |
| `.next/cache` 软链还在吗 | `ls -ld /opt/atlas/current/.next/cache` | 指向 `/opt/atlas/data/cache` | 按 5.1 重做，然后 `systemctl restart atlas` |
| Node 版本 | `node -v` | v22.x（**不需要和本地一致**，见 3.1） | 升级直接 `apt upgrade nodejs`，不用动本地 |
| Caddy 版本与配置 | `caddy version`、`caddy validate --config /etc/caddy/Caddyfile` | 2.6.x，validate 通过 | `apt upgrade caddy`；改配置后用 `systemctl reload caddy`（不是 restart） |
| 证书 | `curl -vI https://你的域名 2>&1 \| grep -i expire` | 还有几十天有效期 | 见 12.3（没域名时这条跳过） |
| 内存 / swap | `free -m` | used < 300 MB，swap 接近 0 | 查是不是多装了常驻进程 |
| 服务开机自启 | `systemctl is-enabled atlas caddy` | 两个都是 `enabled` | `systemctl enable --now atlas caddy` |
| `.env` 权限 | `stat -c '%a %U' /opt/atlas/.env` | `600 atlas` | `chown atlas:atlas` + `chmod 600` |
| 库的大小 | `ls -lh /opt/atlas/data/atlas.db*` | 几 MB 到几十 MB | 涨得快看 `click_logs` 和 `link_checks`，这两张表按天/按次累积，可以归档 |
| 外链巡检 | 手工跑 `curl -fsS -H "x-cron-token: …" http://你的服务器IP/api/cron/link-check` | 返回 JSON：`checked / healthy / dead / unclear / markedStale` | 只有 `dead`（404 / 410 / 域名没了）连续 2 次才会标「疑似失效」，去后台确认 |

> **关于 link-check 的判定**：分 `ok` / `dead` / `unclear` 三档，**没有"警告"这一档**。
> `unclear`（403 / 406 / 429 / 5xx / 超时 / 证书）只记录，不会改状态 ——
> 被反爬拦的站点因此不会每次巡检都变成「疑似失效」。
> 脚本不会自动把条目标成「已失效」——`dead` 必须人工在后台确认。

**升级 Next.js / Node 的正确姿势**：先在本地开一个分支
（`git checkout -b chore/upgrade-2027`），改完跑
`pnpm lint && pnpm typecheck && pnpm build` + 本地 `pnpm start` 点一遍，
再按第七节发到服务器；真出问题就按第十节换软链回滚。**不要直接在主分支上试。**

---

## 十四、上线检查清单

- [ ] `systemctl is-active atlas` → `active`，`systemctl is-active caddy` → `active`
- [ ] `systemctl is-enabled atlas caddy` → 两个都是 `enabled`
- [ ] 服务器本机 `curl -I http://127.0.0.1:4000` 通，外网访问 `4000` **不通**
- [ ] 阿里云安全组只开放 **你的SSH端口 / 80 / 443**（**不是 22**）
- [ ] `http://你的服务器IP/` 能打开（有域名后改成测 HTTPS）
- [ ] `/media/icons/xxx.png` 能访问，响应头含 `Cache-Control: public, max-age=31536000, immutable`
- [ ] **`/media/xxx.svg` 的响应头里能看到 `Content-Security-Policy` 和 `Content-Disposition: attachment`**
- [ ] `ls -ld /opt/atlas/current/.next/cache` → 指向 `/opt/atlas/data/cache`
- [ ] 匿名访问 `/api/file/任意路径` → **401**
- [ ] 匿名访问一条私密条目的公开 URL → **404**（不是 403）
- [ ] 站长登录后看 `/tools`，内容和匿名看到的一模一样
- [ ] `ls -l /opt/atlas/current` 是软链，且指向一个真实存在的 release 目录
- [ ] `ls -1t /opt/atlas/releases` 只有 3 个版本
- [ ] 手工跑一次 `/opt/atlas/scripts/backup.sh`，产出 `.db.gz`
- [ ] **用这份备份恢复出一个测试库，`integrity_check` 为 ok、条目数对得上**
- [ ] crontab 里有 `backup.sh` 和 `/api/cron/qrcodes` 两行（`crontab -u atlas -l`）
- [ ] `free -m` 实际占用 < 300 MB，swap 用量接近 0
- [ ] 重启服务器后 atlas 和 caddy 自动起来
- [ ] `journalctl -u atlas -n 50 --no-pager` 没有反复重启的痕迹

---

## 十五、一屏速查（贴墙版）

```bash
# SSH（22 已关，密码登录已关，必须带端口和私钥）
ssh aliyun
ssh -p 你的SSH端口 -i ~/.ssh/id_ed25519 root@你的服务器IP

# 状态
systemctl is-active atlas caddy; ls -l /opt/atlas/current; free -m; df -h /

# 日志
journalctl -u atlas -f
journalctl -u atlas -n 100 --no-pager
journalctl -u caddy -n 100 --no-pager

# 发布 / 回滚 / 查看（在本地运维工作区跑）
cd 你的运维目录
python deploy.py
python deploy.py --list
python deploy.py --rollback 版本号    # 换成你要回滚到的那个版本号
python deploy.py --logs

# 备份 / 恢复
/opt/atlas/scripts/backup.sh
/opt/atlas/scripts/restore.sh /opt/atlas/data/backups/atlas-YYYY-MM-DD.db.gz

# 定时任务手工触发
curl -fsS -H "x-cron-token: $(grep '^CRON_TOKEN=' /opt/atlas/.env | cut -d= -f2)" \
  http://你的服务器IP/api/cron/qrcodes

# 库直查（只读，别在服务跑着的时候写）
sqlite3 /opt/atlas/data/atlas.db "select count(*) from entries;"
```
