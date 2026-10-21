import '../src/db/load-env';
import { runLinkCheck } from '../src/lib/link-check';

/**
 * 死链巡检脚本。用法：pnpm check-links
 * 核心逻辑在 src/lib/link-check.ts，和 /api/cron/link-check 共用一份实现。
 *
 * 输出里「死链」才是真坏了（404 / 410 / 域名解析不到 / 连接被拒），
 * 「判不了」是被反爬拦、限流、超时、证书问题 —— 只记录，不会被标成疑似失效。
 */
async function main(): Promise<void> {
  console.log('开始巡检外链（HEAD 请求，8 秒超时，并发 10）…\n');

  const started = Date.now();
  const summary = await runLinkCheck();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `检查 ${summary.checked} 条：正常 ${summary.ok} / 死链 ${summary.dead} / 判不了 ${summary.unclear}（耗时 ${elapsed}s）`,
  );

  if (summary.skipped.length > 0) {
    console.log(`\n跳过 ${summary.skipped.length} 条（要外网才能打开，直连只会超时）：`);
    for (const item of summary.skipped) console.log(`  · ${item.name}  ${item.url}`);
    console.log('  （名单来自 src/lib/link-check.ts 的 DEFAULT_SKIP_HOSTS；用 LINK_CHECK_SKIP_HOSTS 覆盖）');
  }

  if (summary.outcomes.length > 0) {
    console.log('\n明细（死链 = 真的要处理；判不了 = 站点不让我们看，不用管）：');
    for (const outcome of summary.outcomes) {
      const tag = outcome.verdict === 'dead' ? '死链' : '判不了';
      console.log(`  ✗ [${tag}] ${outcome.name}  ${outcome.statusCode ?? '—'}  ${outcome.error ?? ''}  ${outcome.url}`);
    }
  }

  if (summary.markedStale.length > 0) {
    console.log(`\n已把 ${summary.markedStale.length} 条连续 2 次「确定失效」的条目标记为「疑似失效」，请在后台确认：`);
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
