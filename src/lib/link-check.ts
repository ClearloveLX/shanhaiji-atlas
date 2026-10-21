import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entries, linkChecks } from '@/db/schema';

/**
 * 死链巡检的核心逻辑。
 * 脚本 scripts/link-check.ts 和 /api/cron/link-check 都调这里，只有一份实现。
 *
 * 结果分三档（以前只有「正常 / 失败」两档，于是 403、超时、限流全被当成死链，
 * 那几条好站每跑一次就被标一次「疑似失效」）：
 *   ok       200-399
 *   dead     404 / 410、域名解析不到（ENOTFOUND）、连接被拒（ECONNREFUSED）—— 这才是「链接坏了」
 *   unclear  被反爬 / WAF 拦（401 / 403 / 406 / 429 / 451）、5xx、超时、TLS 握手失败 —— 判不了
 *
 * 规则：
 *   - HEAD 请求，8 秒超时；403 / 405 / 501 回退 GET（只读响应头）
 *   - 结果写 link_checks（含 verdict），同时更新 entries.last_checked_at
 *   - **只有 dead 连续 2 次才把 active 改成 'stale'（疑似失效）**；
 *     unclear 永远不动状态；'dead'（已失效）也绝不自动写，必须人工确认
 *   - 必须走外网才能打开的站（ChatGPT / Gemini / Claude 这一批）**直接跳过、不发请求**：
 *     服务器在国内机房，直连只会 8 秒超时，白占时间还容易被当成失效。
 *     名单见 DEFAULT_SKIP_HOSTS，用 LINK_CHECK_SKIP_HOSTS 覆盖（逗号分隔，设成空串 = 一条都不跳）
 */

export type LinkVerdict = 'ok' | 'dead' | 'unclear';

export type LinkCheckOutcome = {
  entryId: string;
  name: string;
  url: string;
  verdict: LinkVerdict;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
};

/** 因为「要外网才打得开」被跳过的条目，不发请求、不写库 */
export type SkippedEntry = { name: string; url: string };

export type LinkCheckSummary = {
  checked: number;
  ok: number;
  /** 确定失效（404 / 410 / 域名没了 / 连接被拒） */
  dead: number;
  /** 判不了（被拦、限流、5xx、超时、证书）—— 只记录，不动状态 */
  unclear: number;
  /** dead + unclear，保留给「失败」统计用 */
  failed: number;
  markedStale: string[];
  outcomes: LinkCheckOutcome[];
  /** 本次跳过（需要外网）的条目 */
  skipped: SkippedEntry[];
};

const TIMEOUT_MS = 8000;
const CONCURRENCY = 10;

/**
 * 默认跳过的域名：这几个站在国内机房直连就是超时，巡检既学不到东西，还会误报。
 * 要检查它们，就在服务器上配外网出口，然后把 LINK_CHECK_SKIP_HOSTS 设成空字符串。
 */
const DEFAULT_SKIP_HOSTS = [
  'chatgpt.com',
  'openai.com',
  'claude.ai',
  'anthropic.com',
  'gemini.google.com',
  'grok.com',
  'x.ai',
  'mistral.ai',
  'llama.com',
  'huggingface.co',
];

function skipHosts(): string[] {
  const raw = process.env.LINK_CHECK_SKIP_HOSTS;
  // 没配就用默认名单；配了空字符串表示「一条都不跳」
  if (raw === undefined) return DEFAULT_SKIP_HOSTS;
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function shouldSkip(url: string, hosts: string[]): boolean {
  if (hosts.length === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.some((item) => host === item || host.endsWith(`.${item}`));
  } catch {
    return false;
  }
}

/** 只有这两个状态码说明「这个链接真的没了」 */
const DEAD_STATUS_CODES = new Set([404, 410]);
/** HEAD 不被支持时回退 GET 的码 */
const RETRY_WITH_GET = new Set([403, 405, 501]);

function verdictOfStatus(status: number): LinkVerdict {
  if (status >= 200 && status < 400) return 'ok';
  if (DEAD_STATUS_CODES.has(status)) return 'dead';
  // 400 / 401 / 403 / 406 / 429 / 451 / 5xx：站点还活着，只是不肯给我们看
  return 'unclear';
}

/** 请求的是不是站点首页（只有路径为 / 的那种） */
function isRootPath(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return path === '/' || path === '';
  } catch {
    return false;
  }
}

/** fetch 的错误码可能在 error.code 或 error.cause.code 上 */
function errorCodeOf(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const withCode = error as { code?: unknown; cause?: unknown };
  if (typeof withCode.code === 'string') return withCode.code;

  const cause = withCode.cause;
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string') return causeCode;
  }
  return null;
}

function verdictOfError(error: unknown): { verdict: LinkVerdict; message: string } {
  const raw = error instanceof Error ? error.message : String(error);

  if (/abort/i.test(raw) && !errorCodeOf(error)) {
    return { verdict: 'unclear', message: `请求超时（${TIMEOUT_MS / 1000}s）` };
  }

  const code = errorCodeOf(error);

  if (code === 'ENOTFOUND') return { verdict: 'dead', message: '域名解析不到（ENOTFOUND）' };
  if (code === 'ECONNREFUSED') return { verdict: 'dead', message: '连接被拒（ECONNREFUSED）' };

  // TLS / 证书：Node 的校验比浏览器严，老链条的站点在浏览器里好好的，这里会挂 —— 判不了
  if (code && /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|ERR_SSL/i.test(code)) {
    return { verdict: 'unclear', message: `证书 / TLS 握手失败（${code}）` };
  }
  if (code === 'EAI_AGAIN') return { verdict: 'unclear', message: 'DNS 暂时不可用（EAI_AGAIN）' };
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return { verdict: 'unclear', message: `连接中断（${code}）` };
  }

  return { verdict: 'unclear', message: code ? `${code}：${raw}` : raw };
}

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
    if (RETRY_WITH_GET.has(response.status)) {
      response = await requestOnce(url, 'GET');
    }

    const verdict = verdictOfStatus(response.status);

    // 首页返回 404 多半是站点在拦机器人（小红书这类就回 404），不能当「链接没了」：
    // 正常站点不会把首页做成 404。真正死掉的深链仍然是 dead。
    if (response.status === 404 && isRootPath(url)) {
      return {
        entryId,
        name,
        url,
        verdict: 'unclear',
        ok: false,
        statusCode: response.status,
        error: 'HTTP 404（首页也 404，多半是在拦机器人，不是链接真的没了）',
      };
    }

    return {
      entryId,
      name,
      url,
      verdict,
      ok: verdict === 'ok',
      statusCode: response.status,
      error:
        verdict === 'ok'
          ? null
          : verdict === 'dead'
            ? `HTTP ${response.status}`
            : `HTTP ${response.status}（站点拒绝机器人或限流）`,
    };
  } catch (error) {
    const { verdict, message } = verdictOfError(error);
    return { entryId, name, url, verdict, ok: false, statusCode: null, error: message };
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
  const hosts = skipHosts();

  const allTargets = db
    .select({ id: entries.id, name: entries.name, url: entries.url })
    .from(entries)
    .where(and(isNull(entries.deletedAt), sql`${entries.url} is not null`))
    .all();

  // 要外网才能打开的站：不发请求、不写 link_checks、不动 last_checked_at
  const skipped: SkippedEntry[] = allTargets
    .filter((target) => shouldSkip(target.url ?? '', hosts))
    .map((target) => ({ name: target.name, url: target.url ?? '' }));
  const targets = allTargets.filter((target) => !shouldSkip(target.url ?? '', hosts));

  const outcomes = await runPool(targets, CONCURRENCY, (target) => checkOne(target.id, target.name, target.url ?? ''));

  const markedStale: string[] = [];

  for (const outcome of outcomes) {
    db.insert(linkChecks)
      .values({
        entryId: outcome.entryId,
        statusCode: outcome.statusCode,
        ok: outcome.ok,
        verdict: outcome.verdict,
        error: outcome.error,
        checkedAt: new Date(),
      })
      .run();

    db.update(entries)
      .set({ lastCheckedAt: new Date() })
      .where(eq(entries.id, outcome.entryId))
      .run();

    // 被拦 / 超时 / 5xx 只是记录，不动状态
    if (outcome.verdict !== 'dead') continue;

    // 连续 2 次「确定失效」才标记「疑似失效」
    const recent = db
      .select({ verdict: linkChecks.verdict })
      .from(linkChecks)
      .where(eq(linkChecks.entryId, outcome.entryId))
      .orderBy(desc(linkChecks.checkedAt))
      .limit(2)
      .all();

    const consecutiveDead = recent.length === 2 && recent.every((row) => row.verdict === 'dead');

    if (consecutiveDead) {
      const current = db.select({ status: entries.status }).from(entries).where(eq(entries.id, outcome.entryId)).get();
      if (current && current.status === 'active') {
        db.update(entries).set({ status: 'stale' }).where(eq(entries.id, outcome.entryId)).run();
        markedStale.push(outcome.name);
      }
    }
  }

  const dead = outcomes.filter((outcome) => outcome.verdict === 'dead').length;
  const unclear = outcomes.filter((outcome) => outcome.verdict === 'unclear').length;

  return {
    checked: outcomes.length,
    ok: outcomes.length - dead - unclear,
    dead,
    unclear,
    failed: dead + unclear,
    markedStale,
    outcomes: outcomes.filter((outcome) => outcome.verdict !== 'ok'),
    skipped,
  };
}
