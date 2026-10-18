import '../src/db/load-env';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db';
import { entries } from '../src/db/schema';

/**
 * 一次性规整：把 `sort_weight` 重排成「当前顺序的 10 的倍数」。
 *
 * 背景：早期的手动排序是**按类型分组**的（工具 / 站点 / 店铺 各有一串权重，互不相干），
 * 改成「全站一条队列」之后，旧权重之间没有可比性 —— 比如两个自研工具的权重还是 0，
 * 一上来就会掉到所有站点后面，跟你现在看到的顺序对不上。
 *
 * 这个脚本按**后台现在看到的顺序**（类型分组 → 权重 → 收录时间）重排一遍：
 * 顺序一个都不变，只是换成同一条尺度（总数 × 10 递减），之后就随便拖了。
 *
 * 用法：`pnpm sort:normalize` 预览；`pnpm sort:normalize --apply` 写入。
 */
const TYPE_RANK = `case type when 'tool' then 0 when 'site' then 1 when 'shop' then 2 else 3 end`;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const rows = db.all<{ id: string; name: string; type: string; sort_weight: number }>(sql`
    select id, name, type, sort_weight
    from ${entries}
    where deleted_at is null
    order by ${sql.raw(TYPE_RANK)}, sort_weight desc, created_at desc
  `);

  const changes = rows
    .map((row, index) => ({ ...row, next: (rows.length - index) * 10 }))
    .filter((row) => row.next !== row.sort_weight);

  console.log(`未删除的条目 ${rows.length} 条，需要改权重的 ${changes.length} 条\n`);
  for (const row of changes.slice(0, 20)) {
    console.log(`  · ${row.name}（${row.type}）${row.sort_weight} → ${row.next}`);
  }
  if (changes.length > 20) console.log(`  … 其余 ${changes.length - 20} 条同理`);

  if (!apply) {
    console.log('\n以上是预览。确认无误后执行 `pnpm sort:normalize --apply` 真正写入。');
    return;
  }

  db.transaction((tx) => {
    for (const row of changes) {
      tx.update(entries).set({ sortWeight: row.next }).where(eq(entries.id, row.id)).run();
    }
  });

  console.log(`\n✓ 已写入 ${changes.length} 条`);
}

main().catch((error: unknown) => {
  console.error('✗ 规整失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
