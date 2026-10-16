import { existsSync } from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import './load-env';
import { db, sqlite } from './index';

/** 执行 drizzle/ 下的迁移。用法：pnpm db:migrate */

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

if (!existsSync(migrationsFolder)) {
  console.error('✗ 找不到 drizzle/ 目录，先跑 pnpm db:generate 生成迁移');
  process.exit(1);
}

function appliedCount(): number {
  const table = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get();
  if (!table) return 0;
  const row = sqlite.prepare('select count(*) as count from __drizzle_migrations').get() as { count: number };
  return row.count;
}

const before = appliedCount();

try {
  migrate(db, { migrationsFolder });
} catch (error) {
  console.error('✗ 迁移失败：', error instanceof Error ? error.message : error);
  process.exit(1);
}

const after = appliedCount();

if (after === before) {
  console.log(`数据库已是最新（已应用 ${after} 个迁移）`);
} else {
  console.log(`已应用 ${after - before} 个迁移（累计 ${after} 个）`);
}

console.log(`数据库位置：${path.resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/atlas.db')}`);
