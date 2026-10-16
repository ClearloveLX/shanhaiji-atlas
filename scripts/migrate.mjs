#!/usr/bin/env node
/**
 * 在服务器上跑数据库迁移 —— 只用 Node 内置模块 + better-sqlite3。
 * 不需要 pnpm、不需要 tsx、不需要 drizzle-kit。
 *
 * ★ 为什么必须有这个文件：
 *   docs 定下的规矩是「服务器上只跑 node server.js，不装 pnpm」，
 *   但迁移和建管理员账号却写成了 `pnpm db:migrate` / `pnpm db:seed` ——
 *   服务器上没有 pnpm，这两条命令在服务器上根本跑不了。
 *   结果就是「照文档部署完，站长登不进去」。这个脚本把迁移那半边补上。
 *
 * 格式与 drizzle-orm 官方 migrator **逐字节一致**（已拿本地库核对过）：
 *   __drizzle_migrations(id SERIAL PRIMARY KEY, hash text, created_at numeric)
 *   hash       = sha256(迁移 .sql 文件原始内容) 的十六进制
 *   created_at = drizzle/meta/_journal.json 里对应条目的 when
 * 所以在服务器上用它跑过之后，本地再跑 `pnpm db:migrate` 不会重复应用。
 *
 * 用法（在 release 目录里执行）：
 *   DATABASE_PATH=/opt/atlas/data/atlas.db node scripts/migrate.mjs
 *   node scripts/migrate.mjs --dry-run        # 只看要做什么，不写库
 *
 * 数据库路径的取值顺序：--db 参数 > 环境变量 DATABASE_PATH > ./.env > ./.env.local
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ── 1. 先把 DATABASE_PATH 找出来（纯 node 不会自己读 .env）──

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const dbFlagIndex = argv.indexOf('--db');
const dbFromFlag = dbFlagIndex >= 0 ? argv[dbFlagIndex + 1] : undefined;

const fileEnv = { ...loadEnvFile('.env.local'), ...loadEnvFile('.env') };
const dbPathRaw = dbFromFlag ?? process.env.DATABASE_PATH ?? fileEnv.DATABASE_PATH ?? './data/atlas.db';
const dbPath = path.resolve(process.cwd(), dbPathRaw);

// better-sqlite3 有 Linux 预编译包，standalone 的 node_modules 里就带着，不用现装
const { default: Database } = await import('better-sqlite3');

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

console.log(`迁移目录：${migrationsFolder}`);
console.log(`数据库  ：${dbPath}`);
if (dryRun) console.log('模式    ：--dry-run（不会写库）');
console.log('');

if (!existsSync(journalPath)) {
  console.error('✗ 找不到 drizzle/meta/_journal.json —— release 里必须带上 drizzle/ 目录');
  process.exit(1);
}
if (!existsSync(dbPath)) {
  console.error('✗ 数据库文件不存在，先确认 DATABASE_PATH 对不对');
  process.exit(1);
}

const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const entries = Array.isArray(journal.entries) ? journal.entries : [];

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

// 官方 migrator 建表用的就是这条语句，保持一模一样
sqlite.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)`);

const applied = new Set(
  sqlite
    .prepare('select hash from __drizzle_migrations')
    .all()
    .map((row) => row.hash),
);

let ran = 0;
let skipped = 0;

for (const entry of entries) {
  const file = path.join(migrationsFolder, `${entry.tag}.sql`);
  if (!existsSync(file)) {
    console.error(`✗ journal 里有 ${entry.tag}，但 ${file} 不存在 —— release 不完整`);
    sqlite.close();
    process.exit(1);
  }

  const sql = readFileSync(file, 'utf8');
  const hash = createHash('sha256').update(sql).digest('hex');

  if (applied.has(hash)) {
    skipped += 1;
    console.log(`  · ${entry.tag}  已应用，跳过`);
    continue;
  }

  if (dryRun) {
    console.log(`  → ${entry.tag}  待应用`);
    ran += 1;
    continue;
  }

  try {
    sqlite.exec(sql);
    sqlite
      .prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)')
      .run(hash, entry.when);
    ran += 1;
    console.log(`  ✓ ${entry.tag}  已应用`);
  } catch (error) {
    console.error(`  ✗ ${entry.tag} 失败：${error instanceof Error ? error.message : error}`);
    sqlite.close();
    process.exit(1);
  }
}

const total = sqlite.prepare('select count(*) as n from __drizzle_migrations').get().n;
sqlite.close();

console.log('');
if (dryRun) {
  console.log(`演练结束：待应用 ${ran} 个，已是最新 ${skipped} 个（库内累计 ${total} 个）`);
} else if (ran === 0) {
  console.log(`数据库已是最新（库内累计 ${total} 个迁移）`);
} else {
  console.log(`本次应用 ${ran} 个迁移（库内累计 ${total} 个）`);
}
