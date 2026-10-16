#!/usr/bin/env bash
#
# 山海集 Atlas —— SQLite 备份
#
# 用法：
#   scripts/backup.sh
#   DB=/opt/atlas/data/atlas.db DEST=/opt/atlas/data/backups KEEP=30 scripts/backup.sh
#
# 环境变量：
#   DB    源库路径，默认 /opt/atlas/data/atlas.db
#   DEST  备份目录，默认 /opt/atlas/data/backups
#   KEEP  保留最近多少份，默认 30
#
# ★ 为什么必须用 sqlite3 的 .backup，不能用 cp：
#   库跑在 WAL 模式下，已提交的事务可能还留在 atlas.db-wal 里，没写进主库文件。
#   只 cp 主库，拿到的是一份【缺少最近写入】甚至不一致的库，
#   而这个问题在备份当天看不出来 —— 等真要恢复时才发现数据是旧的。
#   .backup 走的是 SQLite 自己的备份 API：在一个一致的事务快照上读，
#   会自动把 WAL 里已提交的内容一起写进目标文件。
#   VACUUM INTO '<目标>' 效果相同，还会顺带整理碎片，二选一即可。
#
# 挂到宿主 crontab（每天 3 点，结果进 syslog）：
#   crontab -u atlas -e
#   SHELL=/bin/bash
#   0 3 * * * /opt/atlas/scripts/backup.sh 2>&1 | logger -t atlas-backup
#
# 备份文件是 data/ 的一部分，恢复流程见 scripts/restore.sh。
# 没有实测过能恢复的备份等于没有备份。

set -euo pipefail

DB="${DB:-/opt/atlas/data/atlas.db}"
DEST="${DEST:-/opt/atlas/data/backups}"
KEEP="${KEEP:-30}"

log() { printf '[backup] %s\n' "$*"; }
die() { printf '[backup] 失败：%s\n' "$*" >&2; exit 1; }

command -v sqlite3 >/dev/null 2>&1 || die '找不到 sqlite3，先装：apt install -y sqlite3'
[ -f "$DB" ] || die "源库不存在：$DB"

case "$KEEP" in
  '' | *[!0-9]*) die "KEEP 必须是正整数，当前值：$KEEP" ;;
esac
[ "$KEEP" -ge 1 ] || die "KEEP 至少为 1，当前值：$KEEP"

mkdir -p "$DEST" || die "备份目录创建失败：$DEST（检查属主与权限）"
[ -w "$DEST" ] || die "备份目录不可写：$DEST"

STAMP="$(date +%F)"
SNAPSHOT="$DEST/atlas-$STAMP.db"
ARCHIVE="$SNAPSHOT.gz"

log "源库：$DB（$(du -h "$DB" | cut -f1)）"
log "目标：$ARCHIVE"

# 同一天重复执行会覆盖当天那一份，这是有意的：一天一份，KEEP 份 ≈ KEEP 天
rm -f "$SNAPSHOT"
sqlite3 "$DB" ".backup '$SNAPSHOT'" || die '.backup 执行失败（源库可能被别的进程独占）'
[ -s "$SNAPSHOT" ] || die "备份出来是空文件：$SNAPSHOT"

# 写完就校验一次：宁可现在报错，也不要攒一堆读不出来的 .gz
CHECK="$(sqlite3 "$SNAPSHOT" 'PRAGMA quick_check;' 2>&1 || true)"
if [ "$CHECK" != 'ok' ]; then
  die "备份完整性校验没通过（$CHECK）。已保留 $SNAPSHOT 供排查，别把它当成有效备份"
fi

# 记一条可对照的数字，恢复后能确认拿到的就是这一份
ENTRIES="$(sqlite3 "$SNAPSHOT" 'select count(*) from entries;' 2>/dev/null || printf '?')"

gzip -f "$SNAPSHOT"

# 只保留最近 KEEP 份，按修改时间倒序（GNU find 的 -printf，Ubuntu 自带）
mapfile -t OLD < <(
  find "$DEST" -maxdepth 1 -type f -name 'atlas-*.db.gz' -printf '%T@ %p\n' |
    sort -rn |
    awk -v keep="$KEEP" 'NR > keep { print $2 }'
)
if [ "${#OLD[@]}" -gt 0 ]; then
  log "清理旧备份 ${#OLD[@]} 份"
  rm -f -- "${OLD[@]}"
fi

TOTAL="$(find "$DEST" -maxdepth 1 -type f -name 'atlas-*.db.gz' | wc -l | tr -d ' ')"
log "完成：$ARCHIVE（$(du -h "$ARCHIVE" | cut -f1)，entries=$ENTRIES，现有 $TOTAL 份，保留最近 $KEEP 份）"

exit 0
