import { createHmac } from 'node:crypto';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entries, pageViewDaily, visitDaily } from '@/db/schema';
import { auth } from '@/lib/auth';
import { dayKey } from '@/lib/clicks';

/**
 * 访问统计（服务端记录，不在浏览器里打点）。
 *
 * 为什么不用 sendBeacon：
 *   1. 会被广告拦截器拦（正是最活跃的那批用户）
 *   2. 关掉 JS 就统计不到
 *   3. 多一个公开 API 就是多一个要防刷的入口
 *
 * 隐私：**不存 IP、不存 UA、不写 cookie**。只存一个
 * `HMAC-SHA256(AUTH_SECRET, 'pv:{day}:{ip}:{ua}')` 的前 32 位 ——
 * 同一天内同一个人是同一个值（能去重成「1 人」），第二天换一天只变一次盐，前后无法关联。
 *
 * 完整规则见 docs/DATA-MODEL.md 4.5。
 */

/** 哪些路径值得记（同时也是「什么不该记」的白名单式防守） */
const IGNORED_PREFIX = ['/admin', '/me', '/api', '/go/', '/media', '/login', '/og'];

const BOT_PATTERN =
  /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|headless|phantom|puppeteer|playwright|python-requests|python-urllib|axios|curl|wget|go-http-client|java\/|okhttp|scan|monitor|uptime|nagios|semrush|ahrefs|mj12|dotbot|petalbot|yandex/i;

export type PageViewKind = 'home' | 'list' | 'detail' | 'tag' | 'search' | 'tool' | 'other';

/** 归一化路径：去掉 query 和 hash、去掉尾斜杠、压掉重复斜杠、截断到 120 字 */
export function normalizePath(raw: string): string {
  let path = raw.split('?')[0].split('#')[0];
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  return path.slice(0, 120) || '/';
}

/** 只留域名，且只认外部来源；站内跳转返回空串 */
export function normalizeReferrer(raw: string | null, selfHost: string | null): string {
  if (!raw) return '';

  try {
    const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === selfHost?.replace(/^www\./, '').toLowerCase()) return '';
    return host.slice(0, 80);
  } catch {
    return '';
  }
}

/** 当天有效、隔天失效的访客摘要 */
export function visitorHash(ip: string, userAgent: string, day: string): string {
  const secret = process.env.AUTH_SECRET ?? 'atlas-dev-secret';
  return createHmac('sha256', secret).update(`pv:${day}:${ip}:${userAgent}`).digest('hex').slice(0, 32);
}

/**
 * 取访客 IP：Caddy 反代会写 X-Forwarded-For，本地开发两个头都没有。
 * 只取第一跳，不做任何存储。
 */
function clientIp(headerList: Headers): string {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 64);
  return headerList.get('x-real-ip')?.slice(0, 64) ?? '0.0.0.0';
}

function isBot(userAgent: string): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

/** 真正写库：两张表各一条 upsert，同一个事务 */
function writePageView(input: {
  day: string;
  path: string;
  refHost: string;
  kind: PageViewKind;
  entryId: string | null;
  hash: string;
}): void {
  const { day, path, refHost, kind, entryId, hash } = input;

  db.transaction((tx) => {
    tx.insert(visitDaily)
      .values({ day, visitorHash: hash, views: 1, firstPath: path })
      .onConflictDoUpdate({
        target: [visitDaily.day, visitDaily.visitorHash],
        set: { views: sql`${visitDaily.views} + 1` },
      })
      .run();

    tx.insert(pageViewDaily)
      .values({ day, path, refHost, kind, entryId, views: 1 })
      .onConflictDoUpdate({
        target: [pageViewDaily.day, pageViewDaily.path, pageViewDaily.refHost],
        set: { views: sql`${pageViewDaily.views} + 1` },
      })
      .run();

    // 详情页顺带维护总数，和 recordClick 维护 click_count 是同一套做法
    if (entryId) {
      tx.update(entries)
        .set({ viewCount: sql`${entries.viewCount} + 1` })
        .where(eq(entries.id, entryId))
        .run();
    }
  });
}

/**
 * 页面里 `await` 一次即可。
 *
 * ⚠️ Next 不允许在 `after()` 里读请求上下文（headers / cookies 都会直接报错）：
 *      Route / used "headers" inside "after(...)". This is not supported.
 *    所以这里的分工是：**render 阶段读请求信息（headers + 会话），after 阶段只写库**。
 *    也正因为读了 headers()，调用它的页面必然是动态渲染的 —— 静态页不会统计，
 *    也就不会出现「只在构建时记了一次」这种诡异数据。
 */
export async function trackPageView(input: { path: string; kind: PageViewKind; entryId?: string | null }): Promise<void> {
  const [headerList, session] = await Promise.all([headers(), auth()]);

  const path = normalizePath(input.path);
  if (IGNORED_PREFIX.some((prefix) => path.startsWith(prefix))) return;

  // 预取不算访问：列表页里每张卡片一进视口，Next 就会预取详情页
  if (headerList.get('next-router-prefetch')) return;

  // Server Action 的 POST 会让页面再渲染一次（Next 会把新树一起回给客户端），
  // 不排掉的话「进工具页 → UsagePing 调 action」会被记成两次浏览
  if (headerList.get('next-action')) return;

  const userAgent = headerList.get('user-agent') ?? '';
  if (isBot(userAgent)) return;

  // 站长自己不算访客，否则每次刷新都在给自己刷数字
  if (session) return;

  const snapshot = {
    day: dayKey(),
    path,
    refHost: normalizeReferrer(headerList.get('referer'), headerList.get('host')),
    kind: input.kind,
    entryId: input.entryId ?? null,
    hash: visitorHash(clientIp(headerList), userAgent, dayKey()),
  };

  after(() => {
    try {
      writePageView(snapshot);
    } catch (error) {
      // 统计坏了不能影响页面：这里只留一行日志
      console.error('[analytics] 记录访问失败', error);
    }
  });
}
