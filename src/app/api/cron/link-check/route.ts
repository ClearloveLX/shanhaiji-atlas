import { NextResponse } from 'next/server';
import { runLinkCheck } from '@/lib/link-check';

/**
 * 定时巡检入口：宿主 crontab 每天调用一次
 *   curl -fsS -H "x-cron-token: $CRON_TOKEN" https://example.com/api/cron/link-check
 * token 不匹配直接 401。
 *
 * dead（404 / 410 / 域名没了）连续 2 次才标「疑似失效」；
 * unclear（被反爬拦、限流、5xx、超时）只记录，不会改状态。
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_TOKEN;
  const provided = request.headers.get('x-cron-token');

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runLinkCheck();
    return NextResponse.json({
      ok: true,
      checked: summary.checked,
      healthy: summary.ok,
      dead: summary.dead,
      unclear: summary.unclear,
      skipped: summary.skipped.length,
      markedStale: summary.markedStale,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '巡检失败' },
      { status: 500 },
    );
  }
}

/** GET 也放行，方便浏览器里用 token 手动触发一次 */
export async function GET(request: Request) {
  return POST(request);
}
