import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

/**
 * SQLite 连接（better-sqlite3）。
 * 没有进程、没有端口、没有账号，库就是 data/atlas.db 一个文件。
 */

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/atlas.db');

// 上级目录不存在就自动创建（首次 clone 下来时 data/ 是空的）
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

function createConnection(): Database.Database {
  const connection = new Database(dbPath);

  // 这五个 PRAGMA 一个都不能少
  connection.pragma('journal_mode = WAL'); // 允许读写并发；默认的 rollback 模式会锁整库
  connection.pragma('busy_timeout = 5000'); // 写冲突时等 5 秒而不是直接抛 SQLITE_BUSY
  connection.pragma('synchronous = NORMAL'); // WAL 模式下安全，且比 FULL 快很多
  connection.pragma('foreign_keys = ON'); // 默认居然是关的，外键约束不生效
  connection.pragma('cache_size = -16000'); // 16 MB 页缓存

  return connection;
}

// 开发模式下挂到 globalThis，防止热重载重复开库
type GlobalWithSqlite = typeof globalThis & { __atlasSqlite?: Database.Database };
const globalForDb = globalThis as GlobalWithSqlite;

export const sqlite: Database.Database = globalForDb.__atlasSqlite ?? createConnection();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__atlasSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });

export { schema };
