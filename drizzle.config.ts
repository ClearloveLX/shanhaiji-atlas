import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'drizzle-kit';

// tsx / drizzle-kit 不像 Next 那样自动加载 .env.local，这里手动补上（文件不存在就跳过）
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) loadEnvFile(file);
}

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/atlas.db');

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: dbPath },
  verbose: true,
  strict: false,
});
