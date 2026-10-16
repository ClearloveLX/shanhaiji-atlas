import '../src/db/load-env';
import { setDefaultResultOrder } from 'node:dns';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../src/db';
import { entries } from '../src/db/schema';
import { putObject } from '../src/lib/storage';
import { looksLikeSvg, sanitizeSvg } from '../src/lib/svg';
import { deleteIfUnused } from '../src/lib/upload-gc';

/**
 * 抓站点的图标，装到条目上。用法：
 *
 *   pnpm icons:fetch                    # 只抓 SVG，抓不到就保留现有图标
 *   pnpm icons:fetch --png-fallback     # 站点没有 SVG 时，退而抓它自己的 apple-touch-icon / png / ico
 *   pnpm icons:fetch deepseek grok      # 只处理指定的 slug
 *   pnpm icons:fetch --force            # 已经装过 SVG 的也重抓一遍
 *
 * 优先级：SVG > apple-touch-icon > 声明尺寸最大的 png > ico > Google favicon 服务。
 * 抓下来的 SVG 一定过一遍 sanitizeSvg()（src/lib/svg.ts）再落盘 ——
 * 别人的文件不能直接信，尤其是这种会被浏览器当文档打开的格式。
 *
 * 外网站点直连连不上时挂本机代理跑（Node 24+ 认环境变量里的代理，Node 自己不读系统代理设置）：
 *   PowerShell:  $env:HTTPS_PROXY='http://127.0.0.1:7890'; $env:NODE_USE_ENV_PROXY='1'; pnpm icons:fetch --png-fallback
 *
 * 为什么要 setDefaultResultOrder('ipv4first')：Node 17 起 dns.lookup 按解析器返回的顺序
 * 原样使用（AAAA 常常排在前面），在 IPv6 出口不通的机器上 fetch 会直接超时，
 * 而 curl（Happy Eyeballs）却能连上 —— 一个纯粹的「代码看着没问题但就是抓不到」的坑。
 */
setDefaultResultOrder('ipv4first');

const TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_ICON_BYTES = 512 * 1024;
const CONCURRENCY = 4;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

type Fetched =
  | { ok: true; buffer: Uint8Array; contentType: string; finalUrl: string }
  | { ok: false; error: string };

async function get(url: string, maxBytes: number): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,image/*,*/*;q=0.8' },
    });

    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength === 0) return { ok: false, error: '空响应' };
    if (buffer.byteLength > maxBytes) {
      return { ok: false, error: `太大（${Math.round(buffer.byteLength / 1024)}KB）` };
    }

    return { ok: true, buffer, contentType: response.headers.get('content-type') ?? '', finalUrl: response.url };
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const code = cause?.code ?? cause?.message;
    if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
      return { ok: false, error: `超时 ${TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, error: code ? `${code}` : ((error as Error).message || '请求失败') };
  } finally {
    clearTimeout(timer);
  }
}

/* ────────────────────────── 从 HTML 里挑候选 ────────────────────────── */

type Candidate = { kind: 'svg' | 'raster'; url: string; label: string; score: number };

/** HTML 属性里的实体要还原：有些站点把图标地址写成 ?w=32&amp;h=32，不还原就带进了查询串 */
function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function attribute(tag: string, name: string): string {
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
  if (quoted !== undefined) return unescapeHtml(quoted.trim());
  const single = tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i'))?.[1];
  if (single !== undefined) return unescapeHtml(single.trim());
  return unescapeHtml((tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s"'>]+)`, 'i'))?.[1] ?? '').trim());
}

/** data:image/svg+xml,... 内联图标解出来（base64 和 URL 编码两种写法都认） */
function decodeDataUri(href: string): string | null {
  const match = href.match(/^data:image\/svg\+xml(;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i);
  if (!match) return null;

  const [, , base64, payload] = match;
  try {
    return base64 ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

/** 收集页面声明的图标，按「SVG > apple-touch-icon > 尺寸大的 > ico」打分 */
export function collectCandidates(html: string, baseUrl: string): Candidate[] {
  const found: Candidate[] = [];

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, 'rel').toLowerCase();
    if (!rel.includes('icon')) continue;

    const type = attribute(tag, 'type').toLowerCase();
    const href = attribute(tag, 'href');
    if (!href) continue;

    const isSvg = type.includes('svg') || /\.svg(\?|#|$)/i.test(href) || /^data:image\/svg\+xml/i.test(href);
    const sizes = Number(attribute(tag, 'sizes').match(/(\d+)/)?.[1] ?? 0);
    const isTouch = rel.includes('apple-touch');

    let resolved = href;
    if (!href.startsWith('data:')) {
      try {
        resolved = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }

    found.push({
      kind: isSvg ? 'svg' : 'raster',
      url: resolved,
      label: `<link rel="${rel}"${isSvg ? ' type="image/svg+xml"' : ''}>`,
      score: (isSvg ? 1000 : 0) + (isTouch ? 200 : 0) + Math.min(sizes / 4, 180) + (type.includes('x-icon') ? -50 : 0),
    });
  }

  return found.sort((a, b) => b.score - a.score);
}

/** 字节魔数认格式：SPA 站点对任何路径都返回 200 + index.html，只信 content-type 会被骗 */
function sniff(bytes: Uint8Array): 'svg' | 'png' | 'jpeg' | 'webp' | 'gif' | 'ico' | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

  if (bytes.length > 8) {
    if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
    if (ascii(0, 3) === 'GIF') return 'gif';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
    if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'ico';
  }

  if (looksLikeSvg(new TextDecoder().decode(bytes.slice(0, 4000)))) return 'svg';
  return null;
}

type Outcome = {
  slug: string;
  name: string;
  status: 'svg' | 'raster' | 'skipped' | 'no-icon' | 'failed';
  detail: string;
};

async function processEntry(
  row: { id: string; slug: string; name: string; url: string | null; icon: string | null },
  options: { force: boolean; allowRaster: boolean },
): Promise<Outcome> {
  const base = { slug: row.slug, name: row.name };

  if (!row.url) return { ...base, status: 'skipped', detail: '没有外链' };
  if (!options.force && row.icon?.endsWith('.svg')) return { ...base, status: 'skipped', detail: '已经是 SVG' };

  if (!URL.canParse(row.url)) {
    return { ...base, status: 'failed', detail: '外链不是合法 URL' };
  }

  const page = await get(row.url, MAX_HTML_BYTES);

  // ★ 相对地址要按「跳转之后的最终地址」补全，不能按条目里填的地址：
  //   llama.com 会 302 到 dev.meta.ai，按原域名去取 /favicon.ico 只会拿到 400。
  const finalUrl = page.ok ? page.finalUrl : row.url;
  const candidates: Candidate[] = page.ok ? collectCandidates(new TextDecoder().decode(page.buffer), finalUrl) : [];

  // 兜底路径：绝大多数站点把 favicon.svg / apple-touch-icon.png 放在根目录
  const cloudOrigin = new URL(finalUrl).origin;
  if (options.allowRaster) {
    candidates.push(
      { kind: 'raster', url: `${cloudOrigin}/apple-touch-icon.png`, label: '/apple-touch-icon.png', score: 150 },
      { kind: 'raster', url: `${cloudOrigin}/favicon.ico`, label: '/favicon.ico', score: -100 },
      // 最后一招：后台「抓 favicon」用的同一个服务。认不出的域名它返回 404 + 占位图，
      // 而 get() 只认 2xx，所以占位图不会被当成图标存下来。
      {
        kind: 'raster',
        url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(finalUrl).hostname)}&sz=128`,
        label: 'Google favicon 服务',
        score: -200,
      },
    );
  }
  candidates.push({ kind: 'svg', url: `${cloudOrigin}/favicon.svg`, label: '/favicon.svg', score: 500 });

  candidates.sort((a, b) => b.score - a.score);

  const svgCandidates = candidates.filter((item) => item.kind === 'svg');
  const rasterCandidates = candidates.filter((item) => item.kind === 'raster');
  const wanted = options.allowRaster ? [...svgCandidates, ...rasterCandidates] : svgCandidates;

  const problems: string[] = [];

  /** 装好之后更新条目的 icon，并把被替换掉的旧文件回收掉（文件名带内容指纹，换了就是新文件） */
  async function install(url: string): Promise<void> {
    db.update(entries).set({ icon: url }).where(eq(entries.id, row.id)).run();
    if (row.icon && row.icon !== url) await deleteIfUnused(row.icon).catch(() => undefined);
  }

  for (const candidate of wanted) {
    if (candidate.url.startsWith('data:')) {
      const inline = decodeDataUri(candidate.url);
      if (!inline || !looksLikeSvg(inline)) continue;

      const { svg, cleaned } = sanitizeSvg(inline);
      const url = await putObject({
        kind: 'icons',
        filename: `${row.slug}.svg`,
        buffer: new TextEncoder().encode(svg),
        visibility: 'public',
      });
      await install(url);
      return { ...base, status: 'svg', detail: `${(new TextEncoder().encode(svg).byteLength / 1024).toFixed(1)}KB ← 内联 data: URI${cleaned ? '（已清洗）' : ''}` };
    }

    const downloaded = await get(candidate.url, MAX_ICON_BYTES);
    if (!downloaded.ok) {
      problems.push(`${candidate.label} ${downloaded.error}`);
      continue;
    }

    const kind = sniff(downloaded.buffer);
    if (!kind) {
      problems.push(`${candidate.label} 拿回来的不是图片`);
      continue;
    }

    if (kind === 'svg') {
      const { svg, cleaned } = sanitizeSvg(new TextDecoder().decode(downloaded.buffer));
      const url = await putObject({
        kind: 'icons',
        filename: `${row.slug}.svg`,
        buffer: new TextEncoder().encode(svg),
        visibility: 'public',
      });
      await install(url);
      return {
        ...base,
        status: 'svg',
        detail: `${(new TextEncoder().encode(svg).byteLength / 1024).toFixed(1)}KB ← ${candidate.url}${cleaned ? '（已清洗）' : ''}`,
      };
    }

    // 位图：站点自己没给 SVG，退而用它声明的 png / ico（卡片上 32px 显示够用）
    if (!options.allowRaster) {
      problems.push(`${candidate.label} 只有位图`);
      continue;
    }

    const url = await putObject({
      kind: 'icons',
      filename: `${row.slug}.${kind}`,
      buffer: downloaded.buffer,
      visibility: 'public',
    });
    await install(url);
    return {
      ...base,
      status: 'raster',
      detail: `${kind.toUpperCase()} ${Math.round(downloaded.buffer.byteLength / 1024)}KB ← ${candidate.url}`,
    };
  }

  if (!page.ok) return { ...base, status: 'failed', detail: `页面抓不到（${page.error}）` };

  return {
    ...base,
    status: 'no-icon',
    detail: problems.length > 0 ? `站点没给可用的图标（${problems.slice(0, 2).join('；')}）` : '页面里没有任何图标声明',
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const allowRaster = args.includes('--png-fallback');
  const wanted = args.filter((arg) => !arg.startsWith('--'));

  const rows = db
    .select({ id: entries.id, slug: entries.slug, name: entries.name, url: entries.url, icon: entries.icon })
    .from(entries)
    .where(and(eq(entries.linkMode, 'external'), isNotNull(entries.url), isNull(entries.deletedAt)))
    .all()
    .filter((row) => wanted.length === 0 || wanted.includes(row.slug));

  if (rows.length === 0) {
    console.log('没有要处理的条目。');
    return;
  }

  console.log(
    `开始抓图标：${rows.length} 条${force ? '（--force）' : ''}${allowRaster ? '（允许位图兜底）' : '（只抓 SVG）'}\n`,
  );

  const outcomes: Outcome[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < rows.length) {
      const row = rows[cursor];
      cursor += 1;
      const outcome = await processEntry(row, { force, allowRaster });
      outcomes.push(outcome);
      const mark = outcome.status === 'svg' ? '✓' : outcome.status === 'raster' ? '◐' : outcome.status === 'skipped' ? '·' : outcome.status === 'no-icon' ? '—' : '✗';
      console.log(`  ${mark} ${outcome.name.padEnd(10, '　')} ${outcome.detail}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  const count = (status: Outcome['status']) => outcomes.filter((o) => o.status === status).length;
  console.log(
    `\nSVG ${count('svg')} 条 / 位图兜底 ${count('raster')} 条 / 站点没有图标 ${count('no-icon')} 条 / 连不上 ${count('failed')} 条 / 跳过 ${count('skipped')} 条`,
  );

  const missed = outcomes.filter((o) => o.status === 'no-icon' || o.status === 'failed');
  if (missed.length > 0) {
    console.log('\n这些没装上（前台还是首字母色块）：');
    for (const item of missed) console.log(`  · ${item.name}（${item.slug}）— ${item.detail}`);
  }

  if (count('svg') + count('raster') > 0) {
    console.log(
      '\n图标已经写进数据库。前台列表走的是 unstable_cache，最多 5 分钟自己刷新；' +
        '想立刻看到就重启一下服务（或在后台随便保存一条条目把缓存冲掉）。\n' +
        '连不上的站点可以在能访问它的网络里再跑一次：pnpm icons:fetch --png-fallback <slug>',
    );
  }
}

main().catch((error: unknown) => {
  console.error('✗ 抓取失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
