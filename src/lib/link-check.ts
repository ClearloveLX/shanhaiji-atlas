import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entries, linkChecks } from '@/db/schema';

/**
 * 死链巡检的核心逻辑。
 * 脚本 scripts/link-check.ts 和 /api/cron/link-check 都调这里，只有一份实现。
 *
 * 判定规则：
 *   - HEAD 请求，8 秒超时；405 / 403 回退 GET（只读响应头）
 *   - 结果写 link_checks，同时更新 entries.last_checked_at
 *   - **连续 2 次失败只把 status 改成 'stale'（疑似失效），绝不自动改成 'dead'** ——
 *     dead 由人工在后台确认，脚本只负责提示
 */

export type LinkCheckOutcome = {
  entryId: string;
  name: string;
  url: string;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
};

export type LinkCheckSummary = {
  checked: number;
  ok: number;
  failed: number;
  markedStale: string[];
  outcomes: LinkCheckOutcome[];
};

const TIMEOUT_MS = 8000;
const CONCURRENCY = 10;

async function requestOnce(url: string, method: 'HEAD' | 'GET'): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // 有些站会拒绝没有 UA 的请求
        'user-agent': 'Mozilla/5.0 (compatible; AtlasLinkChecker/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkOne(entryId: string, name: string, url: string): Promise<LinkCheckOutcome> {
  try {
    let response = await requestOnce(url, 'HEAD');

    // 不少站点不支持 HEAD：405 / 403 / 501 时回退 GET，只读响应头，不下载正文
    if ([403, 405, 501].includes(response.status)) {
      response = await requestOnce(url, 'GET');
    }

    const ok = response.status >= 200 && response.status < 400;

    return {
      entryId,
      name,
      url,
      ok,
      statusCode: response.status,
      error: ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return {
      entryId,
      name,
      url,
      ok: false,
      statusCode: null,
      error: message.includes('abort') ? `请求超时（${TIMEOUT_MS / 1000}s）` : message,
    };
  }
}

/** 简单 promise pool，不装 p-limit */
async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function runLinkCheck(): Promise<LinkCheckSummary> {
  const targets = db
    .select({ id: entries.id, name: entries.name, url: entries.url })
    .from(entries)
    .where(and(isNull(entries.deletedAt), sql`${entries.url} is not null`))
    .all();

  const outcomes = await runPool(targets, CONCURRENCY, (target) => checkOne(target.id, target.name, target.url ?? ''));

  const markedStale: string[] = [];

  for (const outcome of outcomes) {
    db.insert(linkChecks)
      .values({
        entryId: outcome.entryId,
        statusCode: outcome.statusCode,
        ok: outcome.ok,
        error: outcome.error,
        checkedAt: new Date(),
      })
      .run();

    db.update(entries)
      .set({ lastCheckedAt: new Date() })
      .where(eq(entries.id, outcome.entryId))
      .run();

    if (outcome.ok) continue;

    // 连续 2 次失败才标记「疑似失效」
    const recent = db
      .select({ ok: linkChecks.ok })
      .from(linkChecks)
      .where(eq(linkChecks.entryId, outcome.entryId))
      .orderBy(desc(linkChecks.checkedAt))
      .limit(2)
      .all();

    const consecutiveFailures = recent.length === 2 && recent.every((row) => !row.ok);

    if (consecutiveFailures) {
      const current = db.select({ status: entries.status }).from(entries).where(eq(entries.id, outcome.entryId)).get();
      if (current && current.status === 'active') {
        db.update(entries).set({ status: 'stale' }).where(eq(entries.id, outcome.entryId)).run();
        markedStale.push(outcome.name);
      }
    }
  }

  const failedList = outcomes.filter((outcome) => !outcome.ok);

  return {
    checked: outcomes.length,
    ok: outcomes.length - failedList.length,
    failed: failedList.length,
    markedStale,
    outcomes: failedList,
  };
}
