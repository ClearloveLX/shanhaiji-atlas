import { NextResponse } from 'next/server';
import { sweepExpiredQrcodes } from '@/lib/qrcodes';

/**
 * 每天把过期的二维码停用一次。
 *   curl -fsS -H "x-cron-token: $CRON_TOKEN" https://example.com/api/cron/qrcodes
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_TOKEN;
  const provided = request.headers.get('x-cron-token');

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const affected = await sweepExpiredQrcodes();
    return NextResponse.json({ ok: true, deactivated: affected });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '清理失败' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
