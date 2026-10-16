import '../src/db/load-env';
import { runLinkCheck } from '../src/lib/link-check';

/**
 * 死链巡检脚本。用法：pnpm check-links
 * 核心逻辑在 src/lib/link-check.ts，和 /api/cron/link-check 共用一份实现。
 */
async function main(): Promise<void> {
  console.log('开始巡检外链（HEAD 请求，8 秒超时，并发 10）…\n');

  const started = Date.now();
  const summary = await runLinkCheck();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`检查 ${summary.checked} 条，正常 ${summary.ok} / 失败 ${summary.failed}（耗时 ${elapsed}s）`);

  if (summary.outcomes.length > 0) {
    console.log('\n失败明细：');
    for (const outcome of summary.outcomes) {
      console.log(`  ✗ ${outcome.name}  ${outcome.statusCode ?? '—'}  ${outcome.error ?? ''}  ${outcome.url}`);
    }
  }

  if (summary.markedStale.length > 0) {
    console.log(`\n已把 ${summary.markedStale.length} 条连续 2 次失败的条目标记为「疑似失效」，请在后台确认：`);
    for (const name of summary.markedStale) console.log(`  · ${name}`);
    console.log('\n（脚本不会自动标记「已失效」，dead 需要人工在后台确认。）');
  } else {
    console.log('\n没有新增「疑似失效」条目。');
  }
}

main().catch((error: unknown) => {
  console.error('✗ 巡检失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
