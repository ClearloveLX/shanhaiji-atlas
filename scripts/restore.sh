#!/usr/bin/env bash
#
# 山海集 Atlas —— 从备份恢复 SQLite 库
#
# 用法：
#   scripts/restore.sh /opt/atlas/data/backups/atlas-2026-10-15.db.gz
#   DB=/opt/atlas/data/atlas.db DEST=/opt/atlas/data/backups SERVICE=atlas \
#     scripts/restore.sh /path/to/atlas-2026-10-15.db
#
# 环境变量：
#   DB       目标库路径，默认 /opt/atlas/data/atlas.db
#   DEST     恢复前那份「现场快照」放哪，默认 /opt/atlas/data/backups
#   SERVICE  systemd 单元名，默认 atlas
#
# 它按顺序做七件事，每一步都打印出来：
#   ① 解压备份到临时文件
#   ② 校验备份完整性（不 ok 就直接退出，线上库一动不动）
#   ③ 停下 atlas 服务（避免恢复期间还有写入）
#   ④ 把当前库另存为 atlas-before-restore-<时间戳>.db（同样用 .backup，不用 cp）
#   ⑤ 用备份替换主库，并清掉属于旧库的 -wal / -shm
#   ⑥ 校验恢复后的库，打印条目数对照
#   ⑦ 重启 atlas 并确认 active
#
# ⚠️ 这是破坏性操作。确认步骤不能跳过、也不能加"自动化"开关：
#    恢复错文件 = 线上数据整体回退，唯一的退路就是第 ④ 步那份现场快照。
# ⚠️ 每季度至少真跑一次（哪怕是在演练环境），没实测过的备份等于没有备份。
#
# 出错时的行为（避免"脚本挂了、站也停着"）：
#   - ⑤ 换库【之前】出错 → 旧库完好，脚本会尝试把服务重新拉起来；
#   - ⑤ 换库【之后】出错 → 不自动启动（新的库没通过校验），
#     脚本会打印现场快照的路径，用同一支脚本退回去。

set -euo pipefail

BACKUP="${1:-}"
DB="${DB:-/opt/atlas/data/atlas.db}"
DEST="${DEST:-/opt/atlas/data/backups}"
SERVICE="${SERVICE:-atlas}"

STOPPED=0        # 服务是否已被本脚本停掉
DB_SWAPPED=0     # 主库是否已被替换

log() { printf '[restore] %s\n' "$*"; }

die() {
  printf '[restore] 中止：%s\n' "$*" >&2
  if [ "$STOPPED" = 1 ] && [ "$DB_SWAPPED" = 0 ]; then
    printf '[restore] 旧库没有被改动，尝试把 %s 重新拉起来\n' "$SERVICE" >&2
    systemctl start "$SERVICE" >/dev/null 2>&1 ||
      printf '[restore] ⚠️ 启动失败，手工执行：systemctl start %s\n' "$SERVICE" >&2
  elif [ "$DB_SWAPPED" = 1 ]; then
    printf '[restore] ⚠️ 主库已被替换但没有通过校验，服务保持停止。\n' >&2
    printf '[restore]    退回恢复前那一份：DB=%s SERVICE=%s %s %s/atlas-before-restore-*.db\n' \
      "$DB" "$SERVICE" "$0" "$DEST" >&2
  fi
  exit 1
}

[ -n "$BACKUP" ] || die "用法：$0 <备份文件路径>（.db.gz 或 .db）"
[ -f "$BACKUP" ] || die "备份文件不存在：$BACKUP"
command -v sqlite3 >/dev/null 2>&1 || die '找不到 sqlite3，先装：apt install -y sqlite3'

mkdir -p "$DEST" || die "目录创建失败：$DEST"
[ -w "$DEST" ] || die "目录不可写：$DEST"
[ -w "$(dirname "$DB")" ] || die "数据库所在目录不可写：$(dirname "$DB")（恢复需要替换主库文件）"

TMP_DB="$(mktemp /tmp/atlas-restore-XXXXXX.db)"
cleanup() { rm -f "$TMP_DB"; }
trap cleanup EXIT

# ── ① 解压 ────────────────────────────────────────────────
log "① 解压备份到临时文件：$TMP_DB"
case "$BACKUP" in
  *.gz) gzip -dc "$BACKUP" > "$TMP_DB" || die "解压失败：$BACKUP" ;;
  *.db) cp -f "$BACKUP" "$TMP_DB" ;;
  *) die "只认 .db.gz 或 .db 结尾的备份文件，当前是：$BACKUP" ;;
esac
[ -s "$TMP_DB" ] || die '解压后是空文件，备份本身可能坏了'

# ── ② 校验备份 ────────────────────────────────────────────
log '② 校验备份完整性'
CHECK="$(sqlite3 "$TMP_DB" 'PRAGMA quick_check;' 2>&1 || true)"
[ "$CHECK" = 'ok' ] || die "备份完整性校验没通过（$CHECK），已放弃恢复，线上库未改动"
SRC_ENTRIES="$(sqlite3 "$TMP_DB" 'select count(*) from entries;' 2>/dev/null || printf '?')"
SRC_SIZE="$(du -h "$TMP_DB" | cut -f1)"
log "   备份可用：entries=$SRC_ENTRIES，解压后 $SRC_SIZE"

# ── 二次确认 ──────────────────────────────────────────────
printf '\n[restore] 即将用这份备份【覆盖】%s\n' "$DB"
printf '[restore] 备份文件：%s\n' "$BACKUP"
printf '[restore] 恢复后条目数：%s\n' "$SRC_ENTRIES"
printf '[restore] 当前库会先另存一份到 %s/atlas-before-restore-<时间戳>.db\n' "$DEST"
printf '[restore] 输入 yes 继续（其它任何输入都取消）：'
read -r ANSWER
[ "$ANSWER" = 'yes' ] || die '没有输入 yes，已取消，什么都没有改动'

# ── ③ 停服务 ──────────────────────────────────────────────
HAS_UNIT=0
if command -v systemctl >/dev/null 2>&1 && systemctl cat "${SERVICE}.service" >/dev/null 2>&1; then
  HAS_UNIT=1
  log "③ 停止 ${SERVICE} 服务"
  systemctl stop "$SERVICE" || die "停止 ${SERVICE} 失败，已中止（线上库未改动）"
  STOPPED=1
else
  log "③ 本机没有 ${SERVICE}.service（演练恢复时会这样），跳过停服务，继续"
fi

# ── ④ 现场快照 ────────────────────────────────────────────
if [ -f "$DB" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  SNAP="$DEST/atlas-before-restore-$STAMP.db"
  log "④ 当前库另存为：$SNAP"
  sqlite3 "$DB" ".backup '$SNAP'" || die '当前库另存失败，已中止（线上库未改动）'
  log "   要退回恢复前那一份，直接用同一支脚本：$0 $SNAP"
else
  log "④ 目标库不存在（$DB），没有可另存的内容，跳过"
fi

# ── ⑤ 换库 ────────────────────────────────────────────────
log '⑤ 用备份替换主库'
cp -f "$TMP_DB" "$DB.restore-tmp" || die "写入失败：$DB.restore-tmp"
mv -f "$DB.restore-tmp" "$DB" || die "替换失败：$DB"
DB_SWAPPED=1
# 旧的 -wal / -shm 属于旧库，必须一起清掉，否则新库会被上一份日志污染
rm -f "$DB-wal" "$DB-shm"
if id atlas >/dev/null 2>&1; then
  chown atlas:atlas "$DB"
fi
chmod 0640 "$DB"

# ── ⑥ 校验恢复结果 ────────────────────────────────────────
log '⑥ 校验恢复后的库'
CHECK2="$(sqlite3 "$DB" 'PRAGMA quick_check;' 2>&1 || true)"
[ "$CHECK2" = 'ok' ] || die "恢复后校验没通过（$CHECK2）。现场快照还在 $DEST/atlas-before-restore-*.db，先别重启服务"
NOW_ENTRIES="$(sqlite3 "$DB" 'select count(*) from entries;' 2>/dev/null || printf '?')"
log "   条目数对照：备份=$SRC_ENTRIES，现在的库=$NOW_ENTRIES"
[ "$SRC_ENTRIES" = "$NOW_ENTRIES" ] || log '   ⚠️ 两个数字不一致，先别当成功：用 sqlite3 手工查几条对照一下'

# ── ⑦ 重启服务 ────────────────────────────────────────────
if [ "$HAS_UNIT" = 1 ]; then
  log "⑦ 重启 ${SERVICE} 服务"
  systemctl restart "$SERVICE"
  sleep 2
  if systemctl is-active --quiet "$SERVICE"; then
    log "   ${SERVICE} 状态：active"
  else
    log "   ⚠️ ${SERVICE} 没起来，看日志：journalctl -u ${SERVICE} -n 50 --no-pager"
    log "   退回恢复前那一份：DB=$DB SERVICE=$SERVICE $0 $DEST/atlas-before-restore-*.db"
    exit 1
  fi
else
  log '⑦ 跳过重启（本机没有 systemd 单元），别忘了手工把服务起来'
fi

log "完成：$DB 已从 $BACKUP 恢复（entries=$NOW_ENTRIES）"

exit 0
