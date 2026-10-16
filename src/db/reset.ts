import './load-env';
import { createInterface } from 'node:readline/promises';
import { sqlite } from './index';

/**
 * 开发用：清空所有表后重跑 seed。
 * 执行前要求输入 yes 确认。用法：pnpm db:reset
 */

/** 删除顺序按外键依赖从子到父 */
const TABLES_IN_ORDER = [
  'click_logs',
  'page_view_daily',
  'visit_daily',
  'entry_tags',
  'entry_qrcodes',
  'entry_branches',
  'entry_tools',
  'link_checks',
  'submissions',
  'entries',
  'tags',
  'settings',
] as const;

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('⚠️  这会清空 data/atlas.db 里的全部数据并重跑 seed。输入 yes 继续：');
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('已取消，什么都没做。');
    return;
  }

  sqlite.pragma('foreign_keys = OFF');
  for (const table of TABLES_IN_ORDER) {
    sqlite.prepare(`delete from ${table}`).run();
  }
  sqlite.pragma('foreign_keys = ON');

  console.log('所有表已清空，开始重新灌入种子数据…');

  // seed.ts 在被 import 时直接执行
  await import('./seed');
}

main().catch((error: unknown) => {
  console.error('✗ 重置失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
